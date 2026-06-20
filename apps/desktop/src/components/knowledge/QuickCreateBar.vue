<script setup lang="ts">
import { computed, ref } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
}>();

const mode = ref<"note" | "task">("task");
const title = ref("");

const placeholder = computed(() =>
  mode.value === "note" ? "快速创建笔记…" : "快速创建任务…",
);

function submit(): void {
  const value = title.value.trim();
  if (!value) return;

  if (mode.value === "note") {
    props.workspace.createNote(value);
  } else {
    const column = props.workspace.currentColumns.value[0];
    if (!column) return;
    props.workspace.createTask(column.id, value);
  }

  title.value = "";
}

function setMode(next: "note" | "task"): void {
  mode.value = next;
}
</script>

<template>
  <div class="quick-create-bar">
    <div class="quick-create-modes">
      <button
        type="button"
        class="quick-create-mode"
        :class="{ active: mode === 'task' }"
        @click="setMode('task')"
      >
        任务
      </button>
      <button
        type="button"
        class="quick-create-mode"
        :class="{ active: mode === 'note' }"
        @click="setMode('note')"
      >
        笔记
      </button>
    </div>

    <input
      v-model="title"
      type="text"
      class="quick-create-input"
      :placeholder="placeholder"
      @keydown.enter="submit"
    />

    <button type="button" class="quick-create-submit" @click="submit">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
      创建
    </button>
  </div>
</template>
