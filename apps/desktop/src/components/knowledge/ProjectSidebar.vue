<script setup lang="ts">
import type { KnowledgeProject } from "../../composables/useKnowledgeMock";

defineProps<{
  projects: KnowledgeProject[];
  activeProjectId: string;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();
</script>

<template>
  <aside class="knowledge-sidebar">
    <div class="knowledge-sidebar-brand">
      <div class="knowledge-sidebar-title">NeoCompanion</div>
      <div class="knowledge-sidebar-sub">v3.3 · 知识工作空间</div>
    </div>

    <div class="knowledge-sidebar-section-label">项目</div>

    <button
      v-for="project in projects"
      :key="project.id"
      type="button"
      class="knowledge-project-item"
      :class="{ active: project.id === activeProjectId, inbox: project.isInbox }"
      @click="emit('select', project.id)"
    >
      <span class="project-icon" aria-hidden="true">
        <svg v-if="project.isInbox" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <span class="project-name">{{ project.name }}</span>
      <span class="project-count">{{ project.noteCount }}</span>
    </button>

    <button type="button" class="knowledge-project-add" disabled title="v2 阶段实现">
      <span aria-hidden="true">＋</span>
      <span>新建项目</span>
    </button>

    <div class="knowledge-sidebar-footer">所有内容仅存储在本地</div>
  </aside>
</template>
