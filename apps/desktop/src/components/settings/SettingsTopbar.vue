<script setup lang="ts">
defineProps<{
  title: string;
  isDark: boolean;
}>();

const emit = defineEmits<{
  (event: "toggleTheme"): void;
}>();
</script>

<template>
  <div class="topbar glass">
    <div class="topbar-title">{{ title }}</div>
    <div class="topbar-spacer"></div>
    <button type="button" class="mode-switch" title="切换主题" @click="emit('toggleTheme')">
      <div class="mode-switch-track"></div>
      <div class="mode-switch-handle">
        <span class="mode-switch-icon">{{ isDark ? "☾" : "☀" }}</span>
      </div>
    </button>
    <div class="profile-avatar" title="用户">U</div>
  </div>
</template>
