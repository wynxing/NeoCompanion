<script setup lang="ts">
import type { WeatherSummary, WindowSnapshot } from "@neo-companion/shared";

defineProps<{
  weather: WeatherSummary | null;
  lastWindow: WindowSnapshot | null;
  isFocusActive: boolean;
  focusStartTime: string;
  focusDuration: string;
}>();
</script>

<template>
  <div class="panel-bottom-bar">
    <!-- Companion -->
    <span class="nc-companion">
      <span class="face"></span>
      <span class="text">
        <b>{{ isFocusActive ? "陪伴专注中" : "待命中" }}</b>
        <span>{{ isFocusActive ? `${focusStartTime} 起 · ${focusDuration} 番茄钟` : "点击卡片开始专注" }}</span>
      </span>
      <span v-if="isFocusActive" class="voice-ind"><i></i><i></i><i></i></span>
    </span>

    <!-- Context stack -->
    <span class="nc-ctx-stack">
      <span class="nc-ctx" title="已感知活跃窗口">
        <span class="ico">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <path d="M8 22h8M12 18v4" />
          </svg>
        </span>
        <span class="nc-ctx-label">
          {{ lastWindow ? `${lastWindow.processName} · ${lastWindow.classification}` : "窗口感知等待中" }}
        </span>
      </span>
      <span class="nc-ctx" title="天气">
        <span class="ico">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
          </svg>
        </span>
        <span class="nc-ctx-label">{{ weather?.text ?? "天气读取中" }}</span>
      </span>
    </span>
  </div>
</template>
