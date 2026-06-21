import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KnowledgeStore } from "@neo-companion/db";
import { exportToDir, importFromDir } from "./mirror";
import type {
  KnowledgeBoardColumn,
  KnowledgeNote,
  KnowledgeProject,
  KnowledgeTask,
  KnowledgeTaskStatus
} from "@neo-companion/shared";

/** Minimal in-memory KnowledgeStore for testing the mirror's fs logic. */
function createFakeStore(): KnowledgeStore {
  const projects = new Map<string, KnowledgeProject>();
  const notes = new Map<string, KnowledgeNote>();
  const columns = new Map<string, KnowledgeBoardColumn>();
  const tasks = new Map<string, KnowledgeTask>();
  let counter = 0;
  const id = () => `id-${++counter}`;
  const now = () => Date.now();

  const store: KnowledgeStore = {
    runInTransaction: (operation) => operation(),
    listProjects: () => [...projects.values()].sort((a, b) => a.order - b.order),
    getProject: (i) => projects.get(i) ?? null,
    childProjects: (pid) => [...projects.values()].filter((p) => p.parentId === pid).sort((a, b) => a.order - b.order),
    projectPath: (i) => {
      const out: KnowledgeProject[] = [];
      let cur = projects.get(i) ?? null;
      while (cur) { out.unshift(cur); cur = cur.parentId ? projects.get(cur.parentId) ?? null : null; }
      return out;
    },
    createProject: (input) => {
      const p: KnowledgeProject = {
        id: id(), title: input.title, description: input.description, parentId: input.parentId ?? null,
        color: input.color, icon: input.icon, isInbox: input.isInbox ?? false, order: input.order ?? 0,
        createdAt: now(), updatedAt: now()
      };
      projects.set(p.id, p); return p;
    },
    upsertImportedProject: (p) => { projects.set(p.id, { ...p }); },
    updateProject: (i, patch) => {
      const ex = projects.get(i); if (!ex) return null;
      const next: KnowledgeProject = { ...ex, ...patch, updatedAt: now() };
      projects.set(i, next); return next;
    },
    deleteProject: (i) => {
      projects.delete(i);
      for (const [nid, n] of notes) if (n.projectId === i) notes.delete(nid);
    },
    ensureInbox: () => store.createProject({ title: "收件箱", isInbox: true, order: 0 }),
    notesForProject: (pid) => [...notes.values()].filter((n) => n.projectId === pid),
    getNote: (i) => notes.get(i) ?? null,
    createNote: (pid, title) => {
      const n: KnowledgeNote = { id: id(), projectId: pid, title: title || "无标题", body: "", tags: [], createdAt: now(), updatedAt: now() };
      notes.set(n.id, n); return n;
    },
    upsertImportedNote: (n) => { notes.set(n.id, { ...n }); },
    updateNote: (i, patch) => {
      const ex = notes.get(i); if (!ex) return null;
      const next: KnowledgeNote = { ...ex, ...patch, updatedAt: now() };
      notes.set(i, next); return next;
    },
    deleteNote: (i) => { notes.delete(i); },
    backlinksFor: () => [],
    columnsForProject: (pid) => [...columns.values()].filter((c) => c.projectId === pid).sort((a, b) => a.order - b.order),
    createColumn: (pid, input) => {
      const c: KnowledgeBoardColumn = { id: id(), projectId: pid, title: input.title, status: input.status, order: input.order };
      columns.set(c.id, c); return c;
    },
    upsertImportedColumn: (c) => { columns.set(c.id, { ...c }); },
    updateColumn: (i, patch) => {
      const ex = columns.get(i); if (!ex) return null;
      const next = { ...ex, ...patch };
      columns.set(i, next); return next;
    },
    deleteColumn: (i) => { columns.delete(i); },
    tasksForProject: (pid) => [...tasks.values()].filter((t) => t.projectId === pid).sort((a, b) => a.order - b.order),
    createTask: (pid, columnId, title) => {
      const t: KnowledgeTask = { id: id(), projectId: pid, columnId, title, status: "todo", order: 0, tags: [], createdAt: now(), updatedAt: now() };
      tasks.set(t.id, t); return t;
    },
    upsertImportedTask: (t) => { tasks.set(t.id, { ...t }); },
    updateTask: (i, patch) => {
      const ex = tasks.get(i); if (!ex) return null;
      const next: KnowledgeTask = {
        ...ex,
        title: patch.title ?? ex.title,
        description: patch.description ?? ex.description,
        status: patch.status ?? ex.status,
        columnId: patch.columnId ?? ex.columnId,
        order: patch.order ?? ex.order,
        linkedNoteId: patch.linkedNoteId !== undefined ? (patch.linkedNoteId ?? undefined) : ex.linkedNoteId,
        updatedAt: now()
      };
      tasks.set(i, next); return next;
    },
    deleteTask: (i) => { tasks.delete(i); },
    moveTask: () => {},
    reindexNote: () => {},
    reindexTask: () => {},
    removeIndex: () => {},
    searchFts: () => [],
    getChunkContents: () => new Map(),
    markStale: () => {},
    getIndexStatus: () => ({
      mode: "fts-only" as const, pending: 0, failed: 0, stale: 0, retrying: 0,
      providerConfigured: false, vectorExtensionAvailable: false
    }),
    vecLoaded: false,
    ensureVecTable: () => false,
    searchKnn: () => [],
    putVecChunk: () => {},
    delVecChunk: () => {},
    getCachedEmbedding: () => null as { vector: number[]; dimensions: number } | null,
    putCachedEmbedding: () => {},
    listPendingChunks: () => [],
    markChunkIndexed: () => {},
    markChunkFailed: () => {}
  };
  return store;
}

describe("knowledge file mirror", () => {
  let dir: string;

  beforeEach(async () => {
    dir = path.join(os.tmpdir(), `neo-mirror-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("exports entities to an Obsidian-friendly folder layout", async () => {
    const store = createFakeStore();
    const project = store.createProject({ title: "产品研究", color: "#3b82f6", order: 1 });
    const child = store.createProject({ title: "竞品", parentId: project.id });
    const column = store.createColumn(project.id, { title: "待办", status: "todo" as KnowledgeTaskStatus, order: 0 });
    store.createTask(project.id, column.id, "实现 RRF");
    const note = store.createNote(project.id, "RRF 笔记");
    store.updateNote(note.id, { body: "见 [[t-100]]", tags: ["技术"] });

    const stats = await exportToDir(store, dir);
    expect(stats.projects).toBe(2);
    expect(stats.notes).toBe(1);
    expect(stats.tasks).toBe(1);

    const projectFolder = path.join(dir, "产品研究");
    await expect(fs.readFile(path.join(projectFolder, ".neo", "project.json"), "utf8")).resolves.toContain("产品研究");
    await expect(fs.readFile(path.join(projectFolder, "RRF 笔记.md"), "utf8")).resolves.toContain("见 [[t-100]]");
    await expect(fs.readFile(path.join(projectFolder, ".neo", "columns.jsonl"), "utf8")).resolves.toContain("待办");
    await expect(fs.readFile(path.join(projectFolder, ".neo", "tasks.jsonl"), "utf8")).resolves.toContain("实现 RRF");

    // nested project = subfolder
    await expect(fs.readFile(path.join(projectFolder, "竞品", ".neo", "project.json"), "utf8")).resolves.toContain("竞品");
  });

  it("imports on-disk files back into an empty store", async () => {
    const source = createFakeStore();
    const project = source.createProject({ title: "导入项目", order: 1 });
    const note = source.createNote(project.id, "导入笔记");
    source.updateNote(note.id, { body: "外部编辑内容", tags: ["x"] });

    await exportToDir(source, dir);

    const target = createFakeStore();
    const stats = await importFromDir(target, dir);
    expect(stats.importedProjects).toBe(1);
    expect(target.listProjects()[0].title).toBe("导入项目");
    expect(target.notesForProject(project.id)).toHaveLength(1);
    expect(target.notesForProject(project.id)[0].id).toBe(note.id);

    const second = await importFromDir(target, dir);
    expect(second.importedProjects).toBe(0);
    expect(second.importedNotes).toBe(0);
  });
});
