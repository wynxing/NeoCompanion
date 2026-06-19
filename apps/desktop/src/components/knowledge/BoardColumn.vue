<script setup lang="ts">
import type { BoardColumnMock, KnowledgeTask } from "../../composables/useKnowledgeMock";
import BoardCard from "./BoardCard.vue";

defineProps<{
  column: BoardColumnMock;
  tasks: KnowledgeTask[];
}>();
</script>

<template>
  <section class="knowledge-board-column" :data-status="column.status">
    <header>
      <span class="title">{{ column.title }}</span>
      <span class="count">{{ tasks.length }}</span>
    </header>
    <div class="cards">
      <BoardCard v-for="task in tasks" :key="task.id" :task="task" />
      <div v-if="!tasks.length" class="empty">空</div>
    </div>
  </section>
</template>
