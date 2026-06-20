<script setup lang="ts">
import { computed, ref } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";
import BoardColumn from "./BoardColumn.vue";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
}>();

const hoverColumnId = ref<string | null>(null);
const draggingTaskId = ref<string | null>(null);

const columnsWithTasks = computed(() => {
  return props.workspace.currentColumns.value.map((column) => ({
    column,
    tasks: props.workspace.currentTasks.value
      .filter((t) => t.columnId === column.id)
      .sort((a, b) => a.order - b.order),
  }));
});

function handleDragStart(taskId: string): void {
  draggingTaskId.value = taskId;
}

function handleDragEnd(): void {
  draggingTaskId.value = null;
  hoverColumnId.value = null;
}

function handleDrop(taskId: string, columnId: string, index: number): void {
  props.workspace.moveTask(taskId, columnId, index);
  handleDragEnd();
}

function handleDragHover(columnId: string): void {
  hoverColumnId.value = columnId;
}

function handleDragLeave(): void {
  hoverColumnId.value = null;
}
</script>

<template>
  <div class="knowledge-board-panel">
    <div v-if="workspace.currentColumns.value.length === 0" class="knowledge-board-empty">
      <p>该项目还没有看板列</p>
    </div>

    <div v-else class="knowledge-board-grid">
      <BoardColumn
        v-for="{ column, tasks } in columnsWithTasks"
        :key="column.id"
        :column="column"
        :tasks="tasks"
        :workspace="workspace"
        :is-drop-target="hoverColumnId === column.id"
        :dragging-task-id="draggingTaskId"
        @drag-start="handleDragStart"
        @drag-end="handleDragEnd"
        @drop-task="handleDrop"
        @drag-hover="handleDragHover"
        @drag-leave="handleDragLeave"
      />
    </div>
  </div>
</template>
