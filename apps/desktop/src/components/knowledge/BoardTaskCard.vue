<script setup lang="ts">
import type { KnowledgeTask } from "../../composables/useKnowledgeMock";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";

const props = defineProps<{
  task: KnowledgeTask;
  workspace: KnowledgeWorkspaceState;
  isDragging?: boolean;
  isDropAbove?: boolean;
}>();

const emit = defineEmits<{
  dragstart: [taskId: string];
  dragend: [];
}>();

function onDragStart(event: DragEvent): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", props.task.id);
    event.dataTransfer.setData("application/x-neo-task", props.task.id);
  }
  emit("dragstart", props.task.id);
}

function linkedNoteTitle(): string {
  if (!props.task.linkedNoteId) return "";
  const note = props.workspace.allNotes.value.find((n) => n.id === props.task.linkedNoteId);
  return note?.title ?? "";
}
</script>

<template>
  <article
    class="board-task-card"
    :class="{ 'is-dragging': isDragging, 'is-drop-above': isDropAbove }"
    :data-status="task.status"
    :data-task-id="task.id"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="emit('dragend')"
  >
    <h4 class="board-task-card-title">{{ task.title }}</h4>

    <div v-if="task.tags.length > 0 || task.linkedNoteId" class="board-task-card-meta">
      <span v-for="tag in task.tags" :key="tag" class="kw-tag">{{ tag }}</span>
      <span v-if="task.linkedNoteId && linkedNoteTitle()" class="board-task-card-link">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        {{ linkedNoteTitle() }}
      </span>
    </div>
  </article>
</template>
