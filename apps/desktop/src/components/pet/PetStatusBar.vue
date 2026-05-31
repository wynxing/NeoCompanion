<script setup lang="ts">
defineProps<{
  connected: boolean;
}>();

const emit = defineEmits<{
  openPanel: [];
}>();
</script>

<template>
  <div class="pet-status-bar">
    <span :class="['status-dot', connected ? 'ok' : '']"></span>
    <span>{{ connected ? "已连接" : "连接中" }}</span>
    <button class="pet-open-btn" type="button" @click="emit('openPanel')">展开面板</button>
  </div>
</template>
