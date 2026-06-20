<script setup lang="ts">
import { computed } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
  entityId: string | null;
  entityType: "note" | "task";
}>();

const emit = defineEmits<{
  navigate: [sourceTitle: string];
}>();

const backlinks = computed(() => {
  if (!props.entityId) return [];
  return props.workspace.backlinksFor(props.entityId);
});

function sourceTitle(link: ReturnType<typeof props.workspace.backlinksFor>[number]): string {
  if (link.sourceType === "note") {
    const found = props.workspace.allNotes.value.find((n) => n.id === link.sourceId);
    return found?.title ?? link.sourceId;
  }
  const found = props.workspace.allTasks.value.find((t) => t.id === link.sourceId);
  return found?.title ?? link.sourceId;
}

function follow(link: ReturnType<typeof props.workspace.backlinksFor>[number]): void {
  emit("navigate", sourceTitle(link));
}
</script>

<template>
  <aside v-if="backlinks.length > 0" class="backlinks-panel">
    <header class="backlinks-header">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      引用此{{ entityType === "note" ? "笔记" : "任务" }}
    </header>

    <ul class="backlinks-list">
      <li v-for="link in backlinks" :key="`${link.sourceId}-${link.targetId}`" class="backlinks-item">
        <button type="button" @click="follow(link)">
          <span class="backlinks-type">{{ link.sourceType === "note" ? "笔记" : "任务" }}</span>
          <span class="backlinks-title">{{ sourceTitle(link) }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>
