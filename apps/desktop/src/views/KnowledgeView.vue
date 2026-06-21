<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useKnowledgeWorkspace } from "../composables/useKnowledgeWorkspace";
import { useKnowledgeAi } from "../composables/useKnowledgeAi";
import { useTheme } from "../composables/useTheme";
import { connectWs } from "../api";
import ProjectBrowser from "../components/knowledge/ProjectBrowser.vue";
import ProjectWorkspace from "../components/knowledge/ProjectWorkspace.vue";
import BreadcrumbNav from "../components/knowledge/BreadcrumbNav.vue";
import ThemeToggle from "../components/knowledge/ThemeToggle.vue";

const workspace = useKnowledgeWorkspace();
const theme = useTheme();
const ai = useKnowledgeAi(workspace);

let disconnectWs: (() => void) | null = null;

onMounted(() => {
  void workspace.loadAll();
  // Knowledge view is its own window; connect WS for ai:chunk streaming.
  disconnectWs = connectWs(ai.handleWsMessage);
});

onUnmounted(() => {
  disconnectWs?.();
  disconnectWs = null;
});
</script>

<template>
  <div
    class="knowledge-root"
    data-view="knowledge"
    :data-knowledge-theme="theme.theme.value"
  >
    <header class="knowledge-header">
      <div class="knowledge-header-brand">
        <span class="knowledge-header-logo">NeoCompanion</span>
        <span class="knowledge-header-sub">知识工作空间</span>
      </div>
      <BreadcrumbNav
        :path="workspace.projectPath.value"
        @navigate="workspace.enterProject"
        @root="workspace.selectRoot"
      />
      <ThemeToggle
        :theme="theme.theme.value"
        @toggle="theme.toggleTheme"
      />
    </header>

    <div v-if="workspace.fallbackToMock.value" class="knowledge-banner knowledge-banner--warn">
      {{ workspace.loadError.value ?? "后端未就绪，当前为本地预览数据。" }}
    </div>

    <div v-if="workspace.vecDegradedReason.value" class="knowledge-banner knowledge-banner--info">
      {{ workspace.vecDegradedReason.value }}
    </div>

    <ProjectBrowser
      v-if="!workspace.currentProjectId.value"
      :workspace="workspace"
      @enter="workspace.enterProject"
    />

    <ProjectWorkspace
      v-else
      :workspace="workspace"
      :ai="ai"
      @exit="workspace.exitToParent"
    />
  </div>
</template>
