<script setup lang="ts">
import type { KnowledgeNote } from "../../composables/useKnowledgeMock";
import NoteList from "./NoteList.vue";
import NotePreview from "./NotePreview.vue";

defineProps<{
  notes: KnowledgeNote[];
  activeNote: KnowledgeNote | null;
  editable: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  "update:body": [body: string];
}>();
</script>

<template>
  <div class="knowledge-notes-pane">
    <NoteList :notes="notes" :active-id="activeNote?.id ?? ''" @select="emit('select', $event)" />
    <NotePreview
      :note="activeNote"
      :editable="editable"
      @update:body="emit('update:body', $event)"
    />
  </div>
</template>
