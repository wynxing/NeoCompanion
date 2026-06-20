<script setup lang="ts">
import { ref, computed } from "vue";
import type { BoardColumn, KnowledgeTask } from "../../composables/useKnowledgeMock";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";
import BoardTaskCard from "./BoardTaskCard.vue";

const props = defineProps<{
  column: BoardColumn;
  tasks: KnowledgeTask[];
  workspace: KnowledgeWorkspaceState;
  isDropTarget: boolean;
  draggingTaskId: string | null;
}>();

const emit = defineEmits<{
  dragStart: [taskId: string];
  dragEnd: [];
  dropTask: [taskId: string, columnId: string, index: number];
  dragHover: [columnId: string];
  dragLeave: [];
}>();

const newTaskTitle = ref("");
const isCreating = ref(false);
const columnRef = ref<HTMLElement | null>(null);
const dropIndex = ref<number | null>(null);

// 拖拽落点对应的卡片 id（在该卡片上方插入）；落点在列末尾时为 null 且 dropAtEnd=true。
const visibleTasks = computed(() => props.tasks.filter((t) => t.id !== props.draggingTaskId));
const dropTargetId = computed<string | null>(() => {
  if (dropIndex.value === null) return null;
  const list = visibleTasks.value;
  if (dropIndex.value >= list.length) return null;
  return list[dropIndex.value].id;
});
const dropAtEnd = computed(
  () => dropIndex.value !== null && dropIndex.value >= visibleTasks.value.length,
);

function onDragEnter(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  emit("dragHover", props.column.id);
  dropIndex.value = computeDropIndex(event);
}

function onDragLeave(event: DragEvent): void {
  if (!columnRef.value) return;
  const related = event.relatedTarget as Node | null;
  if (related && columnRef.value.contains(related)) return;
  dropIndex.value = null;
  emit("dragLeave");
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  const taskId =
    event.dataTransfer?.getData("application/x-neo-task") || event.dataTransfer?.getData("text/plain");
  const index = dropIndex.value ?? props.tasks.length;
  dropIndex.value = null;
  if (!taskId) return;
  emit("dropTask", taskId, props.column.id, index);
}

function computeDropIndex(event: DragEvent): number {
  if (!columnRef.value) return props.tasks.length;
  const cards = Array.from(columnRef.value.querySelectorAll(".board-task-card")).filter(
    (card) => card.getAttribute("data-task-id") !== props.draggingTaskId,
  );
  if (cards.length === 0) return 0;
  const rect = columnRef.value.getBoundingClientRect();
  const relativeY = event.clientY - rect.top;
  for (let i = 0; i < cards.length; i += 1) {
    const cardRect = cards[i].getBoundingClientRect();
    const cardMiddle = cardRect.top + cardRect.height / 2 - rect.top;
    if (relativeY < cardMiddle) return i;
  }
  return cards.length;
}

function startCreate(): void {
  isCreating.value = true;
  newTaskTitle.value = "";
}

function confirmCreate(): void {
  const title = newTaskTitle.value.trim();
  if (!title) return;
  props.workspace.createTask(props.column.id, title);
  newTaskTitle.value = "";
  isCreating.value = false;
}

function cancelCreate(): void {
  isCreating.value = false;
  newTaskTitle.value = "";
}
</script>

<template>
  <section
    ref="columnRef"
    class="board-column"
    :class="{ 'is-drop-target': isDropTarget }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <header class="board-column-header">
      <span class="board-column-title">{{ column.title }}</span>
      <span class="board-column-count">{{ tasks.length }}</span>
    </header>

    <div class="board-column-cards">
      <BoardTaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :workspace="workspace"
        :is-dragging="draggingTaskId === task.id"
        :is-drop-above="dropTargetId === task.id"
        @dragstart="$emit('dragStart', task.id); $emit('dragHover', column.id)"
        @dragend="$emit('dragEnd')"
      />

      <div v-if="tasks.length === 0" class="board-column-empty">
        拖拽任务到此处
      </div>

      <div v-if="dropAtEnd" class="board-drop-line" aria-hidden="true" />
    </div>

    <div class="board-column-footer">
      <button v-if="!isCreating" type="button" class="board-column-add" @click="startCreate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        添加任务
      </button>

      <div v-else class="board-column-create" @keydown.esc="cancelCreate">
        <input
          v-model="newTaskTitle"
          type="text"
          placeholder="任务标题"
          autofocus
          @keydown.enter="confirmCreate"
        />
        <button type="button" @click="confirmCreate">创建</button>
      </div>
    </div>
  </section>
</template>
