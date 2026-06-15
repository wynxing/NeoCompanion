<script setup lang="ts">
import type { CompanionState } from "@neo-companion/shared";

defineProps<{
  petState: CompanionState;
}>();

// Static MVP — mood quote and state pills
const pills = [
  { label: "专注", on: true },
  { label: "TTS 关", on: false },
  { label: "沉浸 关", on: false },
  { label: "网关待命", on: false },
];
</script>

<template>
  <div class="card nc-wrap-glass nc-status-card">
    <div class="card-head">
      <div>
        <div class="card-title">助手状态</div>
        <div class="card-sub">陪伴专注 · 18:42 起</div>
      </div>
      <svg style="opacity: 0.5; flex: none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      </svg>
    </div>

    <div class="nc-mood">
      <div class="orb"></div>
      <div class="quote">「你正在做<em>重要的事</em>，不要分心，我会替你挡掉那些 hook 提醒。」</div>
    </div>

    <div class="nc-state-row">
      <span v-for="pill in pills" :key="pill.label" :class="['nc-pill', { on: pill.on }]">
        {{ pill.label }}
      </span>
    </div>
  </div>
</template>
