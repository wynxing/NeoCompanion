<script setup lang="ts">
import { computed } from "vue";

const circumference = 2 * Math.PI * 62;

const props = defineProps<{
  focusActive: boolean;
  focusRemaining: number;
  focusElapsed: number;
  focusDurationSeconds: number;
}>();

const progress = computed(() => {
  return Math.min(100, Math.max(0, (props.focusElapsed / props.focusDurationSeconds) * 100));
});

const minutesText = computed(() => {
  const minutes = Math.ceil(props.focusRemaining / 60);
  return props.focusActive ? String(minutes).padStart(2, "0") : "--";
});
</script>

<template>
  <section class="wallpaper-focus" :class="{ active: focusActive }" aria-label="壁纸专注计时">
    <svg class="wallpaper-focus-ring" viewBox="0 0 152 152" aria-hidden="true">
      <circle class="wallpaper-focus-track" cx="76" cy="76" r="62" />
      <circle
        class="wallpaper-focus-progress"
        cx="76"
        cy="76"
        r="62"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="circumference - (progress / 100) * circumference"
      />
    </svg>
    <div class="wallpaper-focus-copy">
      <strong>{{ minutesText }}</strong>
      <span>{{ focusActive ? "min left" : "focus" }}</span>
    </div>
  </section>
</template>
