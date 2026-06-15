<script setup lang="ts">
import type { CompanionState } from "@neo-companion/shared";

defineProps<{
  petState: CompanionState; // TODO: Phase 2 — use for dynamic avatar state
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
      class="icon-btn"
      type="button"
      style="padding: 0; overflow: hidden"
      :style="{
        background: 'radial-gradient(circle at 30% 30%, #ffe0a3, #ffb347 55%, #c2410c 100%)',
        boxShadow: '0 6px 20px rgba(255,140,40,.35), inset 0 1px 0 rgba(255,255,255,.6)',
      }"
    >
      <span style="position: relative; width: 48px; height: 48px; display: block">
        <span style="position: absolute; left: 14px; top: 18px; width: 4px; height: 6px; background: #3b1f0a; border-radius: 2px"></span>
        <span style="position: absolute; right: 14px; top: 18px; width: 4px; height: 6px; background: #3b1f0a; border-radius: 2px"></span>
        <span style="position: absolute; left: 50%; bottom: 14px; width: 14px; height: 5px; border: 2px solid #3b1f0a; border-top: 0; border-radius: 0 0 12px 12px; transform: translateX(-50%)"></span>
      </span>
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
