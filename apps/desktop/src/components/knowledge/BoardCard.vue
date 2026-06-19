<script setup lang="ts">
import type { KnowledgeTask } from "../../composables/useKnowledgeMock";

defineProps<{
  task: KnowledgeTask;
}>();
</script>

<template>
  <article class="knowledge-board-card" :data-status="task.status">
    <div class="title">{{ task.title }}</div>
    <div v-if="task.tags.length || task.linkedNoteId" class="meta">
      <span v-for="tag in task.tags" :key="tag" class="tag">{{ tag }}</span>
      <span v-if="task.linkedNoteId" class="linked" title="关联笔记">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M9 17H7A5 5 0 0 1 7 7h2" />
          <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
          <path d="M8 12h8" />
        </svg>
        笔记
      </span>
    </div>
  </article>
</template>
