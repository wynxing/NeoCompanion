import { computed, ref } from "vue";
import type { Task, WsMessage } from "@neo-companion/shared";
import { api } from "../api";

export function useTasks() {
  const tasks = ref<Task[]>([]);
  const newTaskTitle = ref("");
  const activeTaskId = ref<string | null>(null);

  const openTasks = computed(() => tasks.value.filter((t) => t.status === "open"));
  const completedTasks = computed(() => tasks.value.filter((t) => t.status === "done"));
  const currentTask = computed(() => tasks.value.find((t) => t.id === activeTaskId.value) ?? null);

  async function loadTasks() {
    tasks.value = await api.listTasks();
    activeTaskId.value = openTasks.value[0]?.id ?? null;
  }

  async function addTask() {
    if (!newTaskTitle.value.trim()) return;
    const task = await api.createTask(newTaskTitle.value);
    tasks.value = [...tasks.value, task];
    activeTaskId.value = task.id;
    newTaskTitle.value = "";
  }

  async function toggleTask(task: Task) {
    const next = await api.patchTask(task.id, { status: task.status === "done" ? "open" : "done" });
    tasks.value = tasks.value.map((item) => (item.id === next.id ? next : item));
    if (next.status === "done" && activeTaskId.value === next.id) {
      activeTaskId.value = openTasks.value[0]?.id ?? null;
    }
  }

  function handleWsMessage(message: WsMessage) {
    if (message.type === "task:statusChanged") {
      void loadTasks();
    }
  }

  return {
    tasks,
    newTaskTitle,
    activeTaskId,
    openTasks,
    completedTasks,
    currentTask,
    loadTasks,
    addTask,
    toggleTask,
    handleWsMessage,
  };
}
