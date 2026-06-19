<script setup lang="ts">
import { computed } from "vue";
import type { BoardColumnMock, KnowledgeTask } from "../../composables/useKnowledgeMock";
import BoardColumn from "./BoardColumn.vue";

const props = defineProps<{
  columns: BoardColumnMock[];
  tasks: KnowledgeTask[];
}>();

const tasksByColumn = computed(() =>
  Object.fromEntries(
    props.columns.map((col) => [col.id, props.tasks.filter((t) => t.boardColumnId === col.id)]),
  ) as Record<string, KnowledgeTask[]>,
);
</script>

<template>
  <div class="knowledge-board-pane">
    <BoardColumn
      v-for="column in columns"
      :key="column.id"
      :column="column"
      :tasks="tasksByColumn[column.id] ?? []"
    />
  </div>
</template>
