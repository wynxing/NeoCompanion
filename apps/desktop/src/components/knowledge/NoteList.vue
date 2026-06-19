<script setup lang="ts">
import { deriveExcerpt, type KnowledgeNote } from "../../composables/useKnowledgeMock";

defineProps<{
  notes: KnowledgeNote[];
  activeId: string;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();
</script>

<template>
  <div class="knowledge-note-list">
    <button
      v-for="note in notes"
      :key="note.id"
      type="button"
      class="knowledge-note-item"
      :class="{ active: note.id === activeId }"
      @click="emit('select', note.id)"
    >
      <div class="title">{{ note.title }}</div>
      <div class="excerpt">{{ deriveExcerpt(note.body) }}</div>
      <div class="meta">
        <span v-for="tag in note.tags" :key="tag" class="tag">{{ tag }}</span>
        <span class="time">{{ note.updatedAt }}</span>
      </div>
    </button>
  </div>
</template>
