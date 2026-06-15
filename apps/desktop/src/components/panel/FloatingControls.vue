<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{
  toggleTts: [];
  toggleImmersive: [];
}>();

const ttsOff = ref(false);
const immersiveOff = ref(false);

function handleTts() {
  ttsOff.value = !ttsOff.value;
  emit("toggleTts");
}

function handleImmersive() {
  immersiveOff.value = !immersiveOff.value;
  emit("toggleImmersive");
}
</script>

<template>
  <div class="panel-float-controls">
    <button :class="['ctrl-btn', { off: ttsOff }]" type="button" aria-label="切换语音播报" @click="handleTts">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
      </svg>
    </button>
    <button :class="['ctrl-btn', { off: immersiveOff }]" type="button" aria-label="沉浸模式" @click="handleImmersive">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3" />
      </svg>
    </button>
  </div>
</template>
