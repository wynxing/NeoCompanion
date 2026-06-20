<script setup lang="ts">
import { onMounted } from "vue";
import { useKnowledgeWorkspace } from "../composables/useKnowledgeWorkspace";
import { useTheme } from "../composables/useTheme";
import ProjectBrowser from "../components/knowledge/ProjectBrowser.vue";
import ProjectWorkspace from "../components/knowledge/ProjectWorkspace.vue";
import BreadcrumbNav from "../components/knowledge/BreadcrumbNav.vue";
import ThemeToggle from "../components/knowledge/ThemeToggle.vue";

const workspace = useKnowledgeWorkspace();
const theme = useTheme();

onMounted(() => {
  void workspace.loadAll();
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

    <ProjectBrowser
      v-if="!workspace.currentProjectId.value"
      :workspace="workspace"
      @enter="workspace.enterProject"
    />

    <ProjectWorkspace
      v-else
      :workspace="workspace"
      @exit="workspace.exitToParent"
    />
  </div>
</template>
