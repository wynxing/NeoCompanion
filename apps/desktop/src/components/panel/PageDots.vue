<script setup lang="ts">
defineProps<{
  pages: Array<{ id: string; label: string }>;
  active: string;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  "update:active": [id: string];
}>();
</script>

<template>
  <nav class="page-dots" role="tablist" :aria-label="ariaLabel ?? 'Panel pages'">
    <button
      v-for="page in pages"
      :key="page.id"
      :class="{ active: page.id === active }"
      type="button"
      role="tab"
      :aria-selected="page.id === active"
      @click="emit('update:active', page.id)"
    >
      {{ page.label }}
    </button>
  </nav>
</template>
