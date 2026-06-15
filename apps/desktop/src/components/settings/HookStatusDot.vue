<script setup lang="ts">
defineProps<{
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}>();
</script>

<template>
  <div class="hook-status">
    <div class="hook-dot" :class="active ? 'active' : 'inactive'"></div>
    <span class="hook-label">{{ active ? activeLabel ?? "运行中" : inactiveLabel ?? "未检测到" }}</span>
  </div>
</template>
