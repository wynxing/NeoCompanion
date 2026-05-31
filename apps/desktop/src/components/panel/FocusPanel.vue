<script setup lang="ts">
import type { Task } from "@neo-companion/shared";

const circumference = 2 * Math.PI * 78;

defineProps<{
  timerText: string;
  focusProgress: number;
  focusMinutes: number;
  isFocusActive: boolean;
  currentTask: Task | null;
}>();

defineEmits<{
  startFocus: [];
  completeFocus: [];
  "update:focusMinutes": [value: number];
}>();
</script>

<template>
  <section class="drawer-panel focus-panel">
    <div class="timer-ring-container">
      <div class="timer-ring">
        <svg viewBox="0 0 180 180">
          <circle class="timer-ring-track" cx="90" cy="90" r="78" />
          <circle
            class="timer-ring-progress"
            :class="{ complete: focusProgress >= 100 }"
            cx="90"
            cy="90"
            r="78"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="circumference - (focusProgress / 100) * circumference"
          />
        </svg>
        <div class="timer-text">{{ timerText }}</div>
      </div>
    </div>

    <div class="focus-config">
      <span>专注时长</span>
      <select :value="focusMinutes" :disabled="isFocusActive" @change="$emit('update:focusMinutes', Number(($event.target as HTMLSelectElement).value))">
        <option :value="15">15 分钟</option>
        <option :value="25">25 分钟</option>
        <option :value="45">45 分钟</option>
      </select>
    </div>

    <p class="focus-hint">
      {{ currentTask ? `正在陪你做：${currentTask.title}` : "从任务里选一件，再开始计时。" }}
    </p>

    <div class="focus-actions">
      <button class="primary" :disabled="isFocusActive || !currentTask" @click="$emit('startFocus')">开始专注</button>
      <button :disabled="!isFocusActive" @click="$emit('completeFocus')">完成</button>
    </div>
  </section>
</template>
