<script setup lang="ts">
const emit = defineEmits<{
  startFocus: [duration: number];
}>();

const durations = [25, 45, 90];
</script>

<template>
  <button class="card card-create" type="button" @click="emit('startFocus', 25)">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span style="font-weight: 500">开始新一段专注</span>
    <span style="font-size: 0.75rem; opacity: 0.55; margin-top: 2px; letter-spacing: 0.06em">
      {{ durations.join(" · ") }} min
    </span>
  </button>
</template>
