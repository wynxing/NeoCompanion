<script setup lang="ts">
import {
  VIEW_LABELS,
  type IndexStatus,
  type KnowledgeProject,
  type KnowledgeViewKey,
} from "../../composables/useKnowledgeMock";
import IndexStatusDot from "./IndexStatusDot.vue";

defineProps<{
  project: KnowledgeProject | null;
  activeView: KnowledgeViewKey;
  searchQuery: string;
  indexStatus: IndexStatus;
}>();

const emit = defineEmits<{
  selectView: [view: KnowledgeViewKey];
  "update:searchQuery": [value: string];
}>();

const views: KnowledgeViewKey[] = ["notes", "board", "tasks"];
</script>

<template>
  <header class="knowledge-topbar">
    <div class="knowledge-topbar-left">
      <h1 class="knowledge-project-title">{{ project?.name ?? "—" }}</h1>
      <span class="knowledge-project-meta">
        {{ project?.noteCount ?? 0 }} 篇笔记 · {{ project?.taskCount ?? 0 }} 项任务
      </span>
    </div>

    <nav class="knowledge-view-tabs" aria-label="视图切换">
      <button
        v-for="view in views"
        :key="view"
        type="button"
        :class="{ active: activeView === view }"
        @click="emit('selectView', view)"
      >
        {{ VIEW_LABELS[view] }}
      </button>
    </nav>

    <div class="knowledge-topbar-right">
      <label class="knowledge-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="text"
          placeholder="搜索本项目笔记与任务"
          :value="searchQuery"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <IndexStatusDot :status="indexStatus" />
    </div>
  </header>
</template>
