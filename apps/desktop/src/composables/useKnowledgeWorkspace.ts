import { computed, ref, shallowRef } from "vue";
import {
  formatKwTime,
  useKnowledgeMock,
  type BoardColumn,
  type KnowledgeLink,
  type KnowledgeNote,
  type KnowledgeProject,
  type KnowledgeTask,
  type KnowledgeViewTab,
} from "./useKnowledgeMock";
import { useKnowledgeApi, type KnowledgeDataSource } from "./useKnowledgeApi";

/**
 * Knowledge workspace orchestration composable.
 * Builds on a data source (real API with mock fallback) to provide navigation,
 * selection, CRUD, drag-and-drop, and bidirectional link resolution scoped to a
 * project. The data source's reactive collections and sync CRUD signatures are
 * shared between useKnowledgeMock and useKnowledgeApi, so this orchestration
 * layer (and the 14 knowledge components) is source-agnostic.
 */

export function useKnowledgeWorkspace() {
  const apiSource = useKnowledgeApi();
  const mock = useKnowledgeMock();

  // Live data source: real API when available, mock on failure (local preview).
  // shallowRef avoids Vue deep-unwrapping the nested Refs inside the data source.
  const source = shallowRef<KnowledgeDataSource>(apiSource);
  const fallbackToMock = ref(false);
  const loadError = ref<string | null>(null);

  async function loadAll(): Promise<void> {
    try {
      await apiSource.loadAll?.();
      source.value = apiSource;
      fallbackToMock.value = false;
      loadError.value = null;
    } catch {
      // sidecar unavailable (e.g. sqlite not loaded) → local mock preview
      source.value = mock;
      fallbackToMock.value = true;
      loadError.value = "后端知识库未就绪，当前为本地预览数据。";
    }
  }

  const data = computed(() => source.value);
  const usingApi = computed(() => source.value === apiSource);

  const currentProjectId = ref<string | null>(null);
  const activeTab = ref<KnowledgeViewTab>("notes");
  const selectedNoteId = ref<string | null>(null);
  const selectedTaskId = ref<string | null>(null);

  const currentProject = computed<KnowledgeProject | null>(
    () => (currentProjectId.value ? data.value.projectById.value.get(currentProjectId.value) ?? null : null),
  );

  const projectPath = computed<KnowledgeProject[]>(() =>
    currentProjectId.value ? data.value.projectPath(currentProjectId.value) : [],
  );

  const childProjects = computed<KnowledgeProject[]>(() =>
    currentProjectId.value ? data.value.childProjects(currentProjectId.value) : [],
  );

  const hasChildren = computed<boolean>(() => childProjects.value.length > 0);

  const currentNotes = computed<KnowledgeNote[]>(() =>
    currentProjectId.value ? data.value.notesForProject(currentProjectId.value) : [],
  );

  const currentTasks = computed<KnowledgeTask[]>(() =>
    currentProjectId.value ? data.value.tasksForProject(currentProjectId.value) : [],
  );

  const currentColumns = computed<BoardColumn[]>(() =>
    currentProjectId.value ? data.value.columnsForProject(currentProjectId.value) : [],
  );

  const activeNote = computed<KnowledgeNote | null>(() => {
    const list = currentNotes.value;
    return list.find((n) => n.id === selectedNoteId.value) ?? list[0] ?? null;
  });

  const activeTask = computed<KnowledgeTask | null>(() => {
    const list = currentTasks.value;
    return list.find((t) => t.id === selectedTaskId.value) ?? null;
  });

  function enterProject(id: string): void {
    currentProjectId.value = id;
    activeTab.value = "notes";
    selectedNoteId.value = null;
    selectedTaskId.value = null;
  }

  function exitToParent(): void {
    const parentId = currentProject.value?.parentId;
    currentProjectId.value = parentId ?? null;
    selectedNoteId.value = null;
    selectedTaskId.value = null;
  }

  function selectRoot(): void {
    currentProjectId.value = null;
    activeTab.value = "projects";
    selectedNoteId.value = null;
    selectedTaskId.value = null;
  }

  function selectTab(tab: KnowledgeViewTab): void {
    activeTab.value = tab;
  }

  function selectNote(id: string | null): void {
    selectedNoteId.value = id;
  }

  function selectTask(id: string | null): void {
    selectedTaskId.value = id;
  }

  function createNote(title: string): KnowledgeNote | null {
    const projectId = currentProjectId.value;
    if (!projectId) return null;
    const note = data.value.createNote(projectId, title);
    selectedNoteId.value = note.id;
    activeTab.value = "notes";
    return note;
  }

  function updateNoteBody(id: string, body: string): void {
    data.value.updateNote(id, { body });
  }

  function deleteNote(id: string): void {
    data.value.deleteNote(id);
    if (selectedNoteId.value === id) {
      selectedNoteId.value = currentNotes.value[0]?.id ?? null;
    }
  }

  function createTask(columnId: string, title: string): KnowledgeTask | null {
    const projectId = currentProjectId.value;
    if (!projectId) return null;
    const task = data.value.createTask(projectId, columnId, title);
    if (!task) return null;
    activeTab.value = "board";
    return task;
  }

  function updateTaskStatus(id: string, status: KnowledgeTask["status"]): void {
    const column = currentColumns.value.find((c) => c.status === status);
    if (!column) return;
    data.value.updateTask(id, { status, columnId: column.id });
  }

  function deleteTask(id: string): void {
    data.value.deleteTask(id);
    if (selectedTaskId.value === id) {
      selectedTaskId.value = null;
    }
  }

  function moveTask(taskId: string, targetColumnId: string, targetIndex: number): void {
    data.value.moveTask(taskId, targetColumnId, targetIndex);
  }

  function resolveLink(label: string): { type: "note" | "task"; id: string } | null {
    return data.value.resolveLink(label);
  }

  function followLink(label: string): boolean {
    const target = resolveLink(label);
    if (!target) return false;
    if (target.type === "note") {
      const note = data.value.notes.value.find((n) => n.id === target.id);
      if (!note) return false;
      enterProject(note.projectId);
      selectNote(note.id);
      activeTab.value = "notes";
      return true;
    }
    const task = data.value.tasks.value.find((t) => t.id === target.id);
    if (!task) return false;
    enterProject(task.projectId);
    selectTask(task.id);
    activeTab.value = "tasks";
    return true;
  }

  function backlinksFor(id: string): KnowledgeLink[] {
    return data.value.backlinksFor(id);
  }

  function childProjectsOf(projectId: string): KnowledgeProject[] {
    return data.value.childProjects(projectId);
  }

  function countNotes(projectId: string): number {
    return data.value.notes.value.filter((n) => n.projectId === projectId).length;
  }

  function countTasks(projectId: string): number {
    return data.value.tasks.value.filter((t) => t.projectId === projectId).length;
  }

  return {
    // Data source lifecycle
    loadAll,
    ready: computed(() => (usingApi.value ? apiSource.ready?.value ?? true : true)),
    loadError,
    fallbackToMock,

    // Navigation
    currentProjectId,
    currentProject,
    projectPath,
    childProjects,
    childProjectsOf,
    hasChildren,
    enterProject,
    exitToParent,
    selectRoot,

    // Tabs
    activeTab,
    selectTab,

    // Notes
    currentNotes,
    activeNote,
    selectedNoteId,
    selectNote,
    createNote,
    updateNoteBody,
    deleteNote,
    countNotes,

    // Tasks / Board
    currentTasks,
    activeTask,
    selectedTaskId,
    selectTask,
    currentColumns,
    createTask,
    updateTaskStatus,
    deleteTask,
    moveTask,
    countTasks,

    // Links
    links: computed(() => data.value.links.value),
    resolveLink,
    followLink,
    backlinksFor,

    // Shared
    projects: computed(() => data.value.projects.value),
    allNotes: computed(() => data.value.notes.value),
    allTasks: computed(() => data.value.tasks.value),
    indexStatus: computed(() => data.value.indexStatus.value),
    formatKwTime,
  };
}

export type KnowledgeWorkspaceState = ReturnType<typeof useKnowledgeWorkspace>;
