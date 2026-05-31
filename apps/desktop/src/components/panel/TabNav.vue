<script setup lang="ts">
type Tab = "focus" | "tasks" | "chat";

defineProps<{
  active: Tab;
}>();

const emit = defineEmits<{
  change: [tab: Tab];
}>();

const tabs: { key: Tab; label: string }[] = [
  { key: "focus", label: "专注" },
  { key: "tasks", label: "任务" },
  { key: "chat", label: "对话" },
];
</script>

<template>
  <nav class="tab-nav" aria-label="功能切换">
    <button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: active === tab.key }" @click="emit('change', tab.key)">
      {{ tab.label }}
    </button>
  </nav>
</template>
