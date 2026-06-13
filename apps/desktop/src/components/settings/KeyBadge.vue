<script setup lang="ts">
defineProps<{
  combo: string;
}>();
</script>

<template>
  <div class="key-badge">{{ combo }}</div>
</template>
