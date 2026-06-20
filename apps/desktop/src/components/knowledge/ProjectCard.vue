<script setup lang="ts">
import { computed } from "vue";
import type { KnowledgeProject } from "../../composables/useKnowledgeMock";

const props = defineProps<{
  project: KnowledgeProject;
  childCount: number;
  noteCount: number;
  taskCount: number;
}>();

const emit = defineEmits<{
  enter: [id: string];
}>();

const isContainer = computed(() => props.childCount > 0);
const accentStyle = computed(() => ({
  "--project-accent": props.project.color ?? "var(--kw-accent)",
}));
</script>

<template>
  <button
    type="button"
    class="project-card"
    :class="{ 'is-container': isContainer, 'is-leaf': !isContainer }"
    :style="accentStyle"
    @click="emit('enter', project.id)"
  >
    <span class="project-card-accent" aria-hidden="true" />

    <span class="project-card-icon">
      <svg
        v-if="project.isInbox"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
      <svg
        v-else-if="isContainer"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
      <svg
        v-else
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </span>

    <span class="project-card-body">
      <span class="project-card-title">{{ project.title }}</span>
      <span v-if="project.description" class="project-card-desc">{{ project.description }}</span>
    </span>

    <span class="project-card-meta">
      <span v-if="childCount > 0" class="project-card-badge">{{ childCount }} 子项目</span>
      <span v-else class="project-card-badge">{{ noteCount }} 笔记 · {{ taskCount }} 任务</span>
    </span>

    <span class="project-card-arrow" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </span>
  </button>
</template>
