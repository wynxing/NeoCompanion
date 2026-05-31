<script setup lang="ts">
import type { WeatherSummary, WindowSnapshot } from "@neo-companion/shared";

defineProps<{
  weather: WeatherSummary | null;
  lastWindow: WindowSnapshot | null;
}>();
</script>

<template>
  <div class="status-bar">
    <div class="status-bar-section">
      <span class="status-bar-text">{{ weather?.text ?? "天气读取中" }}</span>
    </div>
    <div class="status-bar-section">
      <span class="status-bar-text">{{ lastWindow ? `${lastWindow.processName} · ${lastWindow.classification}` : "窗口感知等待中" }}</span>
    </div>
  </div>
</template>
