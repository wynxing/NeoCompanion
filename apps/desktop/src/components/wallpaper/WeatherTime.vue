<script setup lang="ts">
import type { WeatherSummary } from "@neo-companion/shared";

defineProps<{
  weather: WeatherSummary | null;
  currentTime: string;
  currentDate: string;
}>();
</script>

<template>
  <section class="wallpaper-weather" aria-label="壁纸天气和时间">
    <div class="wallpaper-weather-meta">
      <span>{{ weather?.city ?? "未配置位置" }}</span>
      <span>{{ weather?.temperatureC !== null && weather?.temperatureC !== undefined ? `${Math.round(weather.temperatureC)}°C` : "--°C" }}</span>
    </div>
    <time class="wallpaper-time">{{ currentTime }}</time>
    <div class="wallpaper-date">{{ currentDate }}</div>
  </section>
</template>
