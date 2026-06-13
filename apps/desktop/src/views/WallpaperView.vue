<script setup lang="ts">
import { useWallpaperState } from "../composables/useWallpaperState";
import WeatherTime from "../components/wallpaper/WeatherTime.vue";
import FocusDial from "../components/wallpaper/FocusDial.vue";

type WallpaperState = ReturnType<typeof useWallpaperState>;

defineProps<{
  wallpaper: WallpaperState;
}>();
</script>

<template>
  <main class="wallpaper-shell" :data-state="wallpaper.companionState.value">
    <div class="wallpaper-ambient" aria-hidden="true"></div>
    <WeatherTime
      :weather="wallpaper.weather.value"
      :current-time="wallpaper.currentTime.value"
      :current-date="wallpaper.currentDate.value"
    />
    <FocusDial
      :focus-active="wallpaper.focusActive.value"
      :focus-remaining="wallpaper.focusRemaining.value"
      :focus-elapsed="wallpaper.focusElapsed.value"
      :focus-duration-seconds="wallpaper.focusDurationSeconds.value"
    />
  </main>
</template>
