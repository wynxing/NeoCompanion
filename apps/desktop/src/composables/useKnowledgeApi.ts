import { computed, ref, type ComputedRef, type Ref } from "vue";
import { api } from "../api";
import {
  INDEX_STATUS_LABELS,
  STATUS_LABELS,
  TAB_LABELS,
  deriveExcerpt,
  type BoardColumn,
  type IndexStatus,
  type KnowledgeLink,
  type KnowledgeNote,
  type KnowledgeProject,
  type KnowledgeTask,
  type KnowledgeViewTab,
  type TaskStatus,
} from "./useKnowledgeMock";

/**
 * Shared reactive data-source shape that both useKnowledgeMock and
 * useKnowledgeApi satisfy. This is the contract useKnowledgeWorkspace (and the
 * 14 knowledge components) depend on. `loadAll`/`ready` are API-only
 * (mock is always ready synchronously).
 */
export interface KnowledgeDataSource {
  loadAll?(): Promise<void>;
  ready?: Ref<boolean>;
  lastError: Ref<string | null>;
  projects: Ref<KnowledgeProject[]>;
  notes: Ref<KnowledgeNote[]>;
  tasks: Ref<KnowledgeTask[]>;
  columns: Ref<BoardColumn[]>;
  indexStatus: Ref<IndexStatus>;
  projectById: ComputedRef<Map<string, KnowledgeProject>>;
  childrenByParentId: ComputedRef<Map<string, KnowledgeProject[]>>;
  childProjects: (projectId: string) => KnowledgeProject[];
  projectPath: (projectId: string) => KnowledgeProject[];
  notesForProject: (projectId: string) => KnowledgeNote[];
  tasksForProject: (projectId: string) => KnowledgeTask[];
  columnsForProject: (projectId: string) => BoardColumn[];
  links: ComputedRef<KnowledgeLink[]>;
  createNote: (projectId: string, title: string) => KnowledgeNote;
  updateNote: (id: string, patch: Partial<KnowledgeNote>) => void;
  deleteNote: (id: string) => void;
  createTask: (projectId: string, columnId: string, title: string) => KnowledgeTask | null;
  updateTask: (id: string, patch: Partial<KnowledgeTask>) => void;
  deleteTask: (id: string) => void;
  moveTask: (taskId: string, targetColumnId: string, targetIndex: number) => void;
  resolveLink: (label: string) => { type: "note" | "task"; id: string } | null;
  backlinksFor: (id: string) => KnowledgeLink[];
  /** Reason vector retrieval is unavailable, when known (null = healthy/env). */
  vecDegradedReason?: Ref<string | null>;
  /** Refresh index status from the sidecar (API data source only). */
  loadIndexStatus?(): Promise<void>;
}

/**
 * Real-API data source for the knowledge workspace.
 *
 * Same return shape as `useKnowledgeMock` (so `useKnowledgeWorkspace` and the 14
 * knowledge components need no changes), but the reactive collections are
 * populated by `loadAll()` from the sidecar and writes are optimistic:
 *   1. mutate the local reactive cache synchronously (returns the optimistic
 *      object, matching the mock's sync signatures),
 *   2. fire the API call in the background,
 *   3. on success, reconcile the local object with the server response
 *      (notably replace the optimistic id/timestamps with the canonical ones),
 *   4. on failure, roll back the local mutation and surface the error.
 *
 * Local-first: the sidecar is on the same machine with negligible latency, so
 * optimistic updates give instant feedback and failures are rare. We do not
 * build a retry queue (YAGNI).
 */

const LINK_REGEX = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function parseWikiLink(raw: string): { target: string } {
  return { target: raw.split("|").map((s) => s.trim())[0] };
}

function resolveLinkTarget(
  label: string,
  noteByTitle: Map<string, KnowledgeNote>,
  noteById: Map<string, KnowledgeNote>,
  taskById: Map<string, KnowledgeTask>
): { type: "note" | "task"; id: string } | null {
  const key = label.toLowerCase();
  const byTitle = noteByTitle.get(key);
  if (byTitle) return { type: "note", id: byTitle.id };
  const byId = noteById.get(label);
  if (byId) return { type: "note", id: byId.id };
  const task = taskById.get(label);
  if (task) return { type: "task", id: task.id };
  return null;
}

function scanLinks(notes: KnowledgeNote[], tasks: KnowledgeTask[]): KnowledgeLink[] {
  const noteByTitle = new Map<string, KnowledgeNote>();
  const noteById = new Map<string, KnowledgeNote>();
  const taskById = new Map<string, KnowledgeTask>();
  for (const note of notes) {
    noteById.set(note.id, note);
    noteByTitle.set(note.title.toLowerCase(), note);
  }
  for (const task of tasks) taskById.set(task.id, task);

  const links: KnowledgeLink[] = [];
  for (const note of notes) {
    for (const match of note.body.matchAll(LINK_REGEX)) {
      const { target } = parseWikiLink(match[1]);
      const resolved = resolveLinkTarget(target, noteByTitle, noteById, taskById);
      if (resolved) {
        links.push({ sourceId: note.id, sourceType: "note", targetId: resolved.id, targetType: resolved.type, label: target });
      }
    }
  }
  return links;
}

function buildProjectById(projects: KnowledgeProject[]): Map<string, KnowledgeProject> {
  return projects.reduce((map, p) => map.set(p.id, p), new Map<string, KnowledgeProject>());
}

function buildChildrenByParentId(projects: KnowledgeProject[]): Map<string, KnowledgeProject[]> {
  const grouped = projects.reduce<Record<string, KnowledgeProject[]>>((acc, p) => {
    const key = p.parentId ?? "__root__";
    acc[key] = [...(acc[key] ?? []), p];
    return acc;
  }, {});
  return Object.entries(grouped).reduce((map, [key, list]) => {
    map.set(key, [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return map;
  }, new Map<string, KnowledgeProject[]>());
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useKnowledgeApi(): KnowledgeDataSource {
  const projects = ref<KnowledgeProject[]>([]);
  const notesRef = ref<KnowledgeNote[]>([]);
  const tasksRef = ref<KnowledgeTask[]>([]);
  const columnsRef = ref<BoardColumn[]>([]);
  const indexStatus = ref<IndexStatus>("ok");
  const vecDegradedReason = ref<string | null>(null);
  const ready = ref(false);
  const lastError = ref<string | null>(null);

  const projectById = computed(() => buildProjectById(projects.value));
  const childrenByParentId = computed(() => buildChildrenByParentId(projects.value));
  const links = computed(() => scanLinks(notesRef.value, tasksRef.value));

  async function loadAll(): Promise<void> {
    try {
      const [projectList, ...rest] = await Promise.all([
        api.knowledgeListProjects(),
        // also need columns/notes/tasks per project; fetch after we know projects
      ]);
      void rest;
      projects.value = projectList;

      // For each project load its notes/columns/tasks in parallel.
      const ids = projectList.map((p) => p.id);
      const [notesByProject, columnsByProject, tasksByProject] = await Promise.all([
        Promise.all(ids.map((id) => api.knowledgeListNotes(id).catch(() => [] as KnowledgeNote[]))).then((arrs) => arrs.flat()),
        Promise.all(ids.map((id) => api.knowledgeListColumns(id).catch(() => [] as BoardColumn[]))).then((arrs) => arrs.flat()),
        Promise.all(ids.map((id) => api.knowledgeListTasks(id).catch(() => [] as KnowledgeTask[]))).then((arrs) => arrs.flat())
      ]);
      notesRef.value = notesByProject;
      columnsRef.value = columnsByProject;
      tasksRef.value = tasksByProject;

      void loadIndexStatus();

      ready.value = true;
      lastError.value = null;
    } catch (error) {
      ready.value = false;
      lastError.value = error instanceof Error ? error.message : "加载知识库失败";
      throw error;
    }
  }

  /** Pull the rich index status from the sidecar and map it to the UI state +
   *  surface why vector retrieval is unavailable (so silent degradation is visible). */
  async function loadIndexStatus(): Promise<void> {
    try {
      const status = await api.knowledgeIndexStatus();
      indexStatus.value =
        status.mode === "hybrid" ? "ok" : status.mode === "indexing" ? "indexing" : "fts_only";
      if (status.mode === "fts-only") {
        vecDegradedReason.value = status.vecLoadError
          ? `向量扩展加载失败：${status.vecLoadError}`
          : !status.providerConfigured
            ? "未配置 embedding provider，仅全文检索可用"
            : null;
      } else {
        vecDegradedReason.value = null;
      }
    } catch {
      // Index status is best-effort; never block loadAll on it.
    }
  }

  function childProjects(projectId: string): KnowledgeProject[] {
    return childrenByParentId.value.get(projectId) ?? [];
  }

  function projectPath(projectId: string): KnowledgeProject[] {
    const path: KnowledgeProject[] = [];
    let current = projectById.value.get(projectId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? projectById.value.get(current.parentId) : undefined;
    }
    return path;
  }

  function notesForProject(projectId: string): KnowledgeNote[] {
    return notesRef.value.filter((n) => n.projectId === projectId);
  }

  function tasksForProject(projectId: string): KnowledgeTask[] {
    return tasksRef.value.filter((t) => t.projectId === projectId);
  }

  function columnsForProject(projectId: string): BoardColumn[] {
    return columnsRef.value.filter((c) => c.projectId === projectId).sort((a, b) => a.order - b.order);
  }

  // ── optimistic write helpers ──
  function surfaceError(error: unknown, fallback: string): void {
    lastError.value = error instanceof Error ? error.message : fallback;
    // auto-clear after a few seconds so the banner isn't sticky.
    // Use the global setTimeout (not window.setTimeout) so test cleanup that
    // tears down window before the timer fires doesn't throw ReferenceError.
    const msg = error instanceof Error ? error.message : fallback;
    setTimeout(() => {
      if (lastError.value === msg) lastError.value = null;
    }, 5000);
  }

  function createNote(projectId: string, title: string): KnowledgeNote {
    const now = Date.now();
    const optimistic: KnowledgeNote = {
      id: uid("n"),
      projectId,
      title: title.trim(),
      body: `# ${title.trim()}\n\n`,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    notesRef.value = [...notesRef.value, optimistic];

    void api.knowledgeCreateNote(projectId, title)
      .then((server) => {
        notesRef.value = notesRef.value.map((n) => (n.id === optimistic.id ? server : n));
      })
      .catch((error: unknown) => {
        notesRef.value = notesRef.value.filter((n) => n.id !== optimistic.id);
        surfaceError(error, "创建笔记失败");
      });
    return optimistic;
  }

  function updateNote(id: string, patch: Partial<KnowledgeNote>): void {
    const now = Date.now();
    const allowed: Partial<KnowledgeNote> = {
      title: patch.title,
      body: patch.body,
      tags: patch.tags,
      projectId: patch.projectId,
    };
    const previous = notesRef.value;
    notesRef.value = notesRef.value.map((n) => (n.id === id ? { ...n, ...allowed, updatedAt: now } : n));

    void api.knowledgeUpdateNote(id, allowed as Partial<Pick<KnowledgeNote, "title" | "body" | "tags">>)
      .catch((error: unknown) => {
        notesRef.value = previous;
        surfaceError(error, "保存笔记失败");
      });
  }

  function deleteNote(id: string): void {
    const previous = notesRef.value;
    notesRef.value = notesRef.value.filter((n) => n.id !== id);
    tasksRef.value = tasksRef.value.map((t) => (t.linkedNoteId === id ? { ...t, linkedNoteId: undefined } : t));

    void api.knowledgeDeleteNote(id)
      .catch((error: unknown) => {
        notesRef.value = previous;
        surfaceError(error, "删除笔记失败");
      });
  }

  function createTask(projectId: string, columnId: string, title: string): KnowledgeTask | null {
    const column = columnsRef.value.find((c) => c.id === columnId);
    if (!column) return null;
    const now = Date.now();
    const maxOrder = tasksRef.value.filter((t) => t.columnId === columnId).reduce((max, t) => Math.max(max, t.order), -1);
    const optimistic: KnowledgeTask = {
      id: uid("t"),
      projectId,
      columnId,
      title: title.trim(),
      status: column.status,
      order: maxOrder + 1,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    tasksRef.value = [...tasksRef.value, optimistic];

    void api.knowledgeCreateTask(projectId, columnId, title)
      .then((server) => {
        tasksRef.value = tasksRef.value.map((t) => (t.id === optimistic.id ? server : t));
      })
      .catch((error: unknown) => {
        tasksRef.value = tasksRef.value.filter((t) => t.id !== optimistic.id);
        surfaceError(error, "创建任务失败");
      });
    return optimistic;
  }

  function updateTask(id: string, patch: Partial<KnowledgeTask>): void {
    const now = Date.now();
    const previous = tasksRef.value;
    tasksRef.value = tasksRef.value.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t));

    const apiPatch: Partial<Pick<KnowledgeTask, "title" | "description" | "status" | "columnId" | "order">> & { linkedNoteId?: string | null } = {
      title: patch.title,
      description: patch.description,
      status: patch.status,
      columnId: patch.columnId,
      order: patch.order,
      linkedNoteId: patch.linkedNoteId ?? null,
    };
    void api.knowledgeUpdateTask(id, apiPatch)
      .catch((error: unknown) => {
        tasksRef.value = previous;
        surfaceError(error, "更新任务失败");
      });
  }

  function deleteTask(id: string): void {
    const previous = tasksRef.value;
    tasksRef.value = tasksRef.value.filter((t) => t.id !== id);

    void api.knowledgeDeleteTask(id)
      .catch((error: unknown) => {
        tasksRef.value = previous;
        surfaceError(error, "删除任务失败");
      });
  }

  function moveTask(taskId: string, targetColumnId: string, targetIndex: number): void {
    const task = tasksRef.value.find((t) => t.id === taskId);
    const targetColumn = columnsRef.value.find((c) => c.id === targetColumnId);
    if (!task || !targetColumn) return;

    const previous = tasksRef.value;
    const others = tasksRef.value.filter((t) => t.id !== taskId);
    const columnTasks = others.filter((t) => t.columnId === targetColumnId).sort((a, b) => a.order - b.order);
    const before = columnTasks.slice(0, targetIndex);
    const after = columnTasks.slice(targetIndex);
    const nextTasks = others.filter((t) => t.columnId !== targetColumnId);
    const movedTask: KnowledgeTask = { ...task, columnId: targetColumnId, status: targetColumn.status, updatedAt: Date.now() };
    const reordered = [...before, movedTask, ...after].map((t, index) => ({ ...t, order: index }));
    tasksRef.value = [...nextTasks, ...reordered];

    void api.knowledgeMoveTask(taskId, targetColumnId, targetIndex)
      .catch((error: unknown) => {
        tasksRef.value = previous;
        surfaceError(error, "移动任务失败");
      });
  }

  function resolveLink(label: string): { type: "note" | "task"; id: string } | null {
    const { target } = parseWikiLink(label);
    const noteByTitle = new Map<string, KnowledgeNote>();
    const noteById = new Map<string, KnowledgeNote>();
    const taskById = new Map<string, KnowledgeTask>();
    for (const note of notesRef.value) {
      noteById.set(note.id, note);
      noteByTitle.set(note.title.toLowerCase(), note);
    }
    for (const task of tasksRef.value) taskById.set(task.id, task);
    return resolveLinkTarget(target, noteByTitle, noteById, taskById);
  }

  function backlinksFor(id: string): KnowledgeLink[] {
    return links.value.filter((l) => l.targetId === id);
  }

  return {
    loadAll,
    loadIndexStatus,
    lastError,
    ready,
    projects,
    notes: notesRef,
    tasks: tasksRef,
    columns: columnsRef,
    indexStatus,
    vecDegradedReason,
    projectById,
    childrenByParentId,
    childProjects,
    projectPath,
    notesForProject,
    tasksForProject,
    columnsForProject,
    links,
    createNote,
    updateNote,
    deleteNote,
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    resolveLink,
    backlinksFor,
  };
}

export type { BoardColumn, IndexStatus, KnowledgeLink, KnowledgeNote, KnowledgeProject, KnowledgeTask, KnowledgeViewTab, TaskStatus };
export { deriveExcerpt, INDEX_STATUS_LABELS, STATUS_LABELS, TAB_LABELS };
