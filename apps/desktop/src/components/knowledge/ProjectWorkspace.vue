<script setup lang="ts">
import { computed } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";
import type { KnowledgeAiState } from "../../composables/useKnowledgeAi";
import { TAB_LABELS, type KnowledgeViewTab } from "../../composables/useKnowledgeMock";
import IndexStatusDot from "./IndexStatusDot.vue";
import KnowledgeNotesPanel from "./KnowledgeNotesPanel.vue";
import KnowledgeBoardPanel from "./KnowledgeBoardPanel.vue";
import KnowledgeTasksPanel from "./KnowledgeTasksPanel.vue";
import KnowledgeAiPanel from "./KnowledgeAiPanel.vue";
import ProjectBrowser from "./ProjectBrowser.vue";
import QuickCreateBar from "./QuickCreateBar.vue";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
  ai: KnowledgeAiState;
}>();

const emit = defineEmits<{
  exit: [];
}>();

const tabs = computed<KnowledgeViewTab[]>(() => {
  const base: KnowledgeViewTab[] = ["notes", "board", "tasks", "ai"];
  return props.workspace.hasChildren.value ? [...base, "projects"] : base;
});

const metaText = computed(() => {
  const ws = props.workspace;
  return `${ws.countNotes(ws.currentProjectId.value ?? "")} 笔记 · ${ws.countTasks(ws.currentProjectId.value ?? "")} 任务`;
});
</script>

<template>
  <section class="project-workspace">
    <header class="project-workspace-header">
      <div class="project-workspace-title-group">
        <button
          v-if="workspace.currentProject.value?.parentId"
          type="button"
          class="project-workspace-back"
          @click="emit('exit')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回上级
        </button>

        <div class="project-workspace-title-row">
          <span
            class="project-workspace-color"
            :style="{ background: workspace.currentProject.value?.color ?? 'var(--kw-accent)' }"
            aria-hidden="true"
          />
          <h1 class="project-workspace-title">{{ workspace.currentProject.value?.title }}</h1>
        </div>

        <p v-if="workspace.currentProject.value?.description" class="project-workspace-desc">
          {{ workspace.currentProject.value.description }}
        </p>

        <span class="project-workspace-meta">{{ metaText }}</span>
      </div>

      <div class="project-workspace-actions">
        <IndexStatusDot :status="workspace.indexStatus.value" />
      </div>
    </header>

    <nav class="project-workspace-tabs" aria-label="工作区视图">
      <button
        v-for="tab in tabs"
        :key="tab"
        type="button"
        class="project-workspace-tab"
        :class="{ active: workspace.activeTab.value === tab }"
        @click="workspace.selectTab(tab)"
      >
        {{ TAB_LABELS[tab] }}
      </button>
    </nav>

    <div class="project-workspace-content">
      <KnowledgeNotesPanel
        v-if="workspace.activeTab.value === 'notes'"
        :workspace="workspace"
      />

      <KnowledgeBoardPanel
        v-else-if="workspace.activeTab.value === 'board'"
        :workspace="workspace"
      />

      <KnowledgeTasksPanel
        v-else-if="workspace.activeTab.value === 'tasks'"
        :workspace="workspace"
      />

      <KnowledgeAiPanel
        v-else-if="workspace.activeTab.value === 'ai'"
        :workspace="workspace"
        :ai="ai"
      />

      <ProjectBrowser
        v-else-if="workspace.activeTab.value === 'projects'"
        :workspace="workspace"
        @enter="workspace.enterProject"
      />
    </div>

    <QuickCreateBar v-if="workspace.activeTab.value !== 'ai'" :workspace="workspace" />
  </section>
</template>
