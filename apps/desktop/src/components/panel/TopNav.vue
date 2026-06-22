<script setup lang="ts">
import type { CompanionState } from "@neo-companion/shared";
import { companionStateImages } from "../../assets/companion";

defineProps<{
  petState: CompanionState;
  isDark: boolean;
}>();

const emit = defineEmits<{
  toggleTheme: [];
  openSettings: [];
  search: []; // TODO: Phase 2 — global search feature
}>();</script>

<template>
  <nav class="panel-topnav" data-tauri-drag-region>
    <!-- Pet avatar button -->
    <button
      class="icon-btn companion-avatar-button"
      type="button"
      aria-label="NeoCompanion 当前状态"
    >
      <img class="companion-avatar-image" :src="companionStateImages[petState]" alt="" />
    </button>

    <!-- Theme toggle + Settings -->
    <div class="toggle-container">
      <button class="mode-switch" type="button" aria-label="切换主题" @click="emit('toggleTheme')">
        <span class="mode-track"></span>
        <span class="mode-icon">{{ isDark ? "☾" : "☀" }}</span>
        <span class="mode-handle"></span>
      </button>
      <button class="nav-btn" type="button" @click="emit('openSettings')">设置</button>
    </div>

    <!-- Meeting alert (static MVP) -->
    <div class="meeting-alert">
      <span>下个番茄钟即将开始</span>
      <span class="time-tag">5:23 后</span>
      <span class="ring-close"></span>
    </div>

    <!-- Search -->
    <button class="icon-btn" type="button" aria-label="搜索" @click="emit('search')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </button>
  </nav>
</template>

<style scoped>
.companion-avatar-button {
  padding: 2px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 58%, #fff1b8, #f6b24e 62%, #c95d1b 100%);
  box-shadow:
    0 6px 20px rgba(255, 140, 40, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.companion-avatar-image {
  display: block;
  width: 44px;
  height: 44px;
  object-fit: contain;
}
</style>
