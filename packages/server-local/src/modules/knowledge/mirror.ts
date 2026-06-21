import { promises as fs } from "node:fs";
import path from "node:path";
import type { KnowledgeStore } from "@neo-companion/db";
import {
  fromJsonl,
  markdownToNote,
  noteFileName,
  noteToMarkdown,
  projectFolderLayout,
  projectToMeta,
  sanitizeFilename,
  toJsonl,
  type ProjectMeta
} from "@neo-companion/db";
import type {
  KnowledgeBoardColumn,
  KnowledgeNote,
  KnowledgeProject,
  KnowledgeTask
} from "@neo-companion/shared";

/**
 * File-mirror side of the hybrid knowledge store.
 *
 * SQLite stays canonical. `exportToDir` writes the full workspace to an
 * Obsidian-friendly folder layout under `rootPath`; `importFromDir` reconciles
 * on-disk edits back into SQLite with last-write-wins by `updatedAt`. Pure
 * serialization lives in @neo-companion/db/knowledge-fs; this module owns disk
 * I/O and is written against the `KnowledgeStore` interface so it can be tested
 * with an in-memory fake + temp dir (no sqlite native needed).
 */

const NEO_DIR = ".neo";

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonOptional<T>(file: string): Promise<T | null> {
  try {
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readTextOptional(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Resolve the on-disk folder path for a project by walking its ancestor chain. */
function resolveProjectFolder(rootPath: string, project: KnowledgeProject, pathById: Map<string, KnowledgeProject>): string {
  const segments: string[] = [];
  let current: KnowledgeProject | null = project;
  let guard = 0;
  while (current && guard < 32) {
    segments.unshift(sanitizeFilename(current.title));
    current = current.parentId ? (pathById.get(current.parentId) ?? null) : null;
    guard += 1;
  }
  return path.join(rootPath, ...segments);
}

export interface MirrorStats {
  projects: number;
  notes: number;
  columns: number;
  tasks: number;
}

/** Write the entire workspace (SQLite → files). Overwrites existing mirror files. */
export async function exportToDir(store: KnowledgeStore, rootPath: string): Promise<MirrorStats> {
  await ensureDir(rootPath);
  const projects = store.listProjects();
  const pathById = new Map(projects.map((p) => [p.id, p]));

  const stats: MirrorStats = { projects: 0, notes: 0, columns: 0, tasks: 0 };

  for (const project of projects) {
    const folder = resolveProjectFolder(rootPath, project, pathById);
    const neoDir = path.join(folder, NEO_DIR);
    await ensureDir(neoDir);

    const layout = projectFolderLayout(folder);
    await fs.writeFile(layout.projectMetaPath, JSON.stringify(projectToMeta(project), null, 2), "utf8");

    const columns = store.columnsForProject(project.id);
    await fs.writeFile(layout.columnsPath, toJsonl(columns), "utf8");
    stats.columns += columns.length;

    const tasks = store.tasksForProject(project.id);
    await fs.writeFile(layout.tasksPath, toJsonl(tasks), "utf8");
    stats.tasks += tasks.length;

    for (const note of store.notesForProject(project.id)) {
      await fs.writeFile(path.join(folder, noteFileName(note)), noteToMarkdown(note), "utf8");
      stats.notes += 1;
    }
    stats.projects += 1;
  }

  return stats;
}

export interface ImportStats {
  importedProjects: number;
  importedNotes: number;
  importedColumns: number;
  importedTasks: number;
  skipped: number;
  reindexedNotes: number;
  reindexedTasks: number;
  errors: string[];
}

export interface ImportHooks {
  noteChanged?: (note: KnowledgeNote) => void;
  taskChanged?: (task: KnowledgeTask) => void;
}

/**
 * Reconcile on-disk edits back into SQLite (files → SQLite), last-write-wins
 * by `updatedAt`. Creates projects/notes/columns/tasks that exist on disk but
 * not in SQLite; updates those whose file `updatedAt` is newer.
 */
export async function importFromDir(store: KnowledgeStore, rootPath: string, hooks: ImportHooks = {}): Promise<ImportStats> {
  const stats: ImportStats = {
    importedProjects: 0, importedNotes: 0, importedColumns: 0, importedTasks: 0,
    skipped: 0, reindexedNotes: 0, reindexedTasks: 0, errors: []
  };

  const projectFolders = await collectProjectFolders(rootPath);
  for (const folder of projectFolders) {
    try {
    const meta = await readJsonOptional<ProjectMeta>(path.join(folder, NEO_DIR, "project.json"));
    if (!meta) {
      stats.skipped += 1;
      continue;
    }

    const existing = store.getProject(meta.id);
    if (!existing || meta.updatedAt > existing.updatedAt) {
      store.runInTransaction(() => store.upsertImportedProject({
          id: meta.id, title: meta.title, parentId: meta.parentId,
          description: meta.description, color: meta.color, icon: meta.icon,
          isInbox: meta.isInbox, order: meta.order,
          createdAt: meta.createdAt, updatedAt: meta.updatedAt
        }));
      stats.importedProjects += 1;
    }

    // notes
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const content = await fs.readFile(path.join(folder, entry.name), "utf8");
      const parsed = markdownToNote(content);
      if (!parsed) continue;
      const fm = parsed.frontMatter;
      const existingNote = store.getNote(fm.id);
      if (!existingNote || fm.updatedAt > existingNote.updatedAt) {
        const noteInput: KnowledgeNote = {
          id: fm.id,
          projectId: meta.id,
          title: fm.title,
          body: parsed.body,
          tags: fm.tags,
          createdAt: fm.createdAt,
          updatedAt: fm.updatedAt
        };
        store.runInTransaction(() => {
          store.upsertImportedNote(noteInput);
          hooks.noteChanged?.(noteInput);
        });
        stats.reindexedNotes += 1;
        stats.importedNotes += 1;
      }
    }

    // columns
    const columnsText = await readTextOptional(path.join(folder, NEO_DIR, "columns.jsonl"));
    if (columnsText) {
      for (const col of fromJsonl<KnowledgeBoardColumn>(columnsText)) {
        const existingCol = store.columnsForProject(meta.id).find((c) => c.id === col.id);
        if (!existingCol || col.order !== existingCol.order || col.title !== existingCol.title || col.status !== existingCol.status) {
          store.runInTransaction(() => store.upsertImportedColumn({ ...col, projectId: meta.id }));
          stats.importedColumns += 1;
        }
      }
    }

    // tasks
    const tasksText = await readTextOptional(path.join(folder, NEO_DIR, "tasks.jsonl"));
    if (tasksText) {
      for (const task of fromJsonl<KnowledgeTask>(tasksText)) {
        const existingTask = store.tasksForProject(meta.id).find((t) => t.id === task.id);
        if (!existingTask || task.updatedAt > existingTask.updatedAt) {
          const importedTask = { ...task, projectId: meta.id };
          store.runInTransaction(() => {
            store.upsertImportedTask(importedTask);
            hooks.taskChanged?.(importedTask);
          });
          stats.reindexedTasks += 1;
          stats.importedTasks += 1;
        }
      }
    }
    } catch (error) {
      stats.errors.push(`${folder}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return stats;
}

/** Recursively find folders containing a `.neo/project.json`. */
async function collectProjectFolders(rootPath: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === NEO_DIR) continue;
      const child = path.join(dir, entry.name);
      const metaExists = await readJsonOptional(path.join(child, NEO_DIR, "project.json"));
      if (metaExists !== null) {
        result.push(child);
        await walk(child); // nested projects
      }
    }
  }
  await walk(rootPath);
  return result;
}
