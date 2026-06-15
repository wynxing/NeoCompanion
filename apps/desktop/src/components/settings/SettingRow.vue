<script setup lang="ts">
defineProps<{
  label: string;
  hint?: string;
}>();
</script>

<template>
  <div class="setting-row">
    <div class="setting-info">
      <div class="setting-label">{{ label }}</div>
      <div v-if="hint" class="setting-hint">{{ hint }}</div>
    </div>
    <div v-if="$slots.action" class="setting-action">
      <slot name="action" />
    </div>
  </div>
</template>
