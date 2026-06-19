<script setup lang="ts">
import { computed } from "vue";
import { INDEX_STATUS_LABELS, type IndexStatus } from "../../composables/useKnowledgeMock";

const props = defineProps<{
  status: IndexStatus;
  showLabel?: boolean;
}>();

const label = computed(() => INDEX_STATUS_LABELS[props.status]);
</script>

<template>
  <span class="knowledge-index-dot" :class="`status-${status}`" :title="label">
    <span class="dot" aria-hidden="true"></span>
    <span v-if="showLabel ?? true" class="label">{{ label }}</span>
  </span>
</template>
