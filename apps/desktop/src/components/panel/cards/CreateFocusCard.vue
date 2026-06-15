<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  startFocus: [duration: number];
}>();

const durations = [25, 45, 90];
const selected = ref(25);
</script>

<template>
  <div class="card card-create">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
    <span style="font-weight: 500">开始新一段专注</span>
    <div class="dur-pick">
      <button
        v-for="d in durations"
        :key="d"
        type="button"
        :class="['dur-chip', { sel: selected === d }]"
        @click.stop="selected = d"
      >
        {{ d }}
      </button>
      <span style="font-size: 0.72rem; opacity: 0.5">min</span>
    </div>
    <button
      class="play-btn"
      type="button"
      style="margin-top: 12px; background: var(--blue); color: #fff"
      @click="emit('startFocus', selected)"
    >
      开始
    </button>
  </div>
</template>
