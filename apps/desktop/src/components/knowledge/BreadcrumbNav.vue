<script setup lang="ts">
import type { KnowledgeProject } from "../../composables/useKnowledgeMock";

defineProps<{
  path: KnowledgeProject[];
}>();

const emit = defineEmits<{
  navigate: [id: string];
  root: [];
}>();
</script>

<template>
  <nav class="knowledge-breadcrumb" aria-label="项目路径">
    <button
      type="button"
      class="knowledge-breadcrumb-item"
      :class="{ 'is-root': path.length === 0 }"
      @click="emit('root')"
    >
      全部项目
    </button>

    <template v-for="(project, index) in path" :key="project.id">
      <span class="knowledge-breadcrumb-separator" aria-hidden="true">/</span>
      <button
        type="button"
        class="knowledge-breadcrumb-item"
        :class="{ 'is-active': index === path.length - 1 }"
        @click="emit('navigate', project.id)"
      >
        {{ project.title }}
      </button>
    </template>
  </nav>
</template>
