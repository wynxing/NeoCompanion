<script setup lang="ts">
import { computed, ref } from "vue";
import type { KnowledgeTask, TaskStatus } from "../../composables/useKnowledgeMock";
import { STATUS_LABELS } from "../../composables/useKnowledgeMock";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
}>();

const statusFilter = ref<TaskStatus | "all">("all");

const filteredTasks = computed(() => {
  const tasks = props.workspace.currentTasks.value;
  if (statusFilter.value === "all") return tasks;
  return tasks.filter((t) => t.status === statusFilter.value);
});

const statuses: TaskStatus[] = ["todo", "doing", "done", "archived"];

function linkedNoteTitle(task: KnowledgeTask): string {
  if (!task.linkedNoteId) return "";
  const note = props.workspace.allNotes.value.find((n) => n.id === task.linkedNoteId);
  return note?.title ?? "";
}

function deleteTask(task: KnowledgeTask): void {
  props.workspace.deleteTask(task.id);
}

function changeStatus(task: KnowledgeTask, status: TaskStatus): void {
  props.workspace.updateTaskStatus(task.id, status);
}
</script>

<template>
  <div class="knowledge-tasks-panel">
    <header class="knowledge-tasks-header">
      <span class="knowledge-tasks-count">{{ filteredTasks.length }} 项任务</span>

      <div class="knowledge-tasks-filters">
        <button
          type="button"
          class="filter-pill"
          :class="{ active: statusFilter === 'all' }"
          @click="statusFilter = 'all'"
        >
          全部
        </button>
        <button
          v-for="status in statuses"
          :key="status"
          type="button"
          class="filter-pill"
          :class="{ active: statusFilter === status }"
          @click="statusFilter = status"
        >
          {{ STATUS_LABELS[status] }}
        </button>
      </div>
    </header>

    <ul v-if="filteredTasks.length > 0" class="knowledge-tasks-list">
      <li
        v-for="task in filteredTasks"
        :key="task.id"
        class="knowledge-task-row"
        :data-status="task.status"
      >
        <select
          class="knowledge-task-status-select"
          :value="task.status"
          @change="changeStatus(task, ($event.target as HTMLSelectElement).value as TaskStatus)"
        >
          <option v-for="status in statuses" :key="status" :value="status">{{ STATUS_LABELS[status] }}</option>
        </select>

        <span class="knowledge-task-row-title">{{ task.title }}</span>

        <div class="knowledge-task-row-meta">
          <span v-for="tag in task.tags" :key="tag" class="kw-tag">{{ tag }}</span>
          <span v-if="linkedNoteTitle(task)" class="knowledge-task-row-link">
            {{ linkedNoteTitle(task) }}
          </span>
        </div>

        <button type="button" class="knowledge-task-row-delete" @click="deleteTask(task)">删除</button>
      </li>
    </ul>

    <div v-else class="knowledge-tasks-empty">
      <p>没有符合条件的任务</p>
    </div>
  </div>
</template>
