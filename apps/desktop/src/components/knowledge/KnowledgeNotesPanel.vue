<script setup lang="ts">
import { ref } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";
import type { KnowledgeNote } from "../../composables/useKnowledgeMock";
import MarkdownEditor from "../markdown-editor/MarkdownEditor.vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import BacklinksPanel from "./BacklinksPanel.vue";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
}>();

const editing = ref(false);
const newNoteTitle = ref("");
const isCreating = ref(false);

function selectNote(note: KnowledgeNote): void {
  props.workspace.selectNote(note.id);
  editing.value = false;
}

function toggleEditing(): void {
  editing.value = !editing.value;
}

function updateBody(body: string): void {
  const id = props.workspace.activeNote.value?.id;
  if (!id) return;
  props.workspace.updateNoteBody(id, body);
}

function startCreate(): void {
  isCreating.value = true;
  newNoteTitle.value = "";
}

function confirmCreate(): void {
  const title = newNoteTitle.value.trim();
  if (!title) return;
  props.workspace.createNote(title);
  newNoteTitle.value = "";
  isCreating.value = false;
  editing.value = true;
}

function cancelCreate(): void {
  isCreating.value = false;
  newNoteTitle.value = "";
}

function deleteActiveNote(): void {
  const id = props.workspace.activeNote.value?.id;
  if (!id) return;
  props.workspace.deleteNote(id);
}

function followLink(label: string): void {
  props.workspace.followLink(label);
}
</script>

<template>
  <div class="knowledge-notes-panel">
    <aside class="knowledge-notes-list">
      <header class="knowledge-notes-list-header">
        <span class="knowledge-notes-count">{{ workspace.currentNotes.value.length }} 篇笔记</span>
        <button type="button" class="knowledge-notes-add" @click="startCreate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新笔记
        </button>
      </header>

      <div v-if="isCreating" class="knowledge-notes-create">
        <input
          v-model="newNoteTitle"
          type="text"
          placeholder="笔记标题"
          autofocus
          @keydown.enter="confirmCreate"
          @keydown.esc="cancelCreate"
        />
        <div class="knowledge-notes-create-actions">
          <button type="button" class="primary" @click="confirmCreate">创建</button>
          <button type="button" @click="cancelCreate">取消</button>
        </div>
      </div>

      <button
        v-for="note in workspace.currentNotes.value"
        :key="note.id"
        type="button"
        class="knowledge-note-row"
        :class="{ active: workspace.activeNote.value?.id === note.id }"
        @click="selectNote(note)"
      >
        <span class="knowledge-note-row-title">{{ note.title }}</span>
        <span class="knowledge-note-row-meta">{{ workspace.formatKwTime(note.updatedAt) }}</span>
      </button>

      <div v-if="workspace.currentNotes.value.length === 0 && !isCreating" class="knowledge-notes-empty">
        <p>还没有笔记</p>
        <button type="button" @click="startCreate">创建第一篇笔记</button>
      </div>
    </aside>

    <div v-if="workspace.activeNote.value" class="knowledge-notes-preview">
      <header class="knowledge-notes-preview-header">
        <div class="knowledge-notes-preview-title-group">
          <h2 class="knowledge-notes-preview-title">{{ workspace.activeNote.value.title }}</h2>
          <span class="knowledge-notes-preview-meta">{{ workspace.formatKwTime(workspace.activeNote.value.updatedAt) }}</span>
        </div>
        <div class="knowledge-notes-preview-actions">
          <button
            type="button"
            class="preview-edit"
            :class="{ 'is-editing': editing }"
            @click="toggleEditing"
          >
            {{ editing ? "完成" : "编辑" }}
          </button>
          <button type="button" class="preview-delete" @click="deleteActiveNote">删除</button>
        </div>
      </header>

      <MarkdownEditor
        v-if="editing"
        :model-value="workspace.activeNote.value.body"
        :editable="true"
        :show-toolbar="true"
        @update:model-value="updateBody"
      />

      <MarkdownPreview
        v-else
        :body="workspace.activeNote.value.body"
        @link-click="followLink"
      />

      <BacklinksPanel
        :workspace="workspace"
        :entity-id="workspace.activeNote.value.id"
        entity-type="note"
        @navigate="workspace.followLink"
      />
    </div>

    <div v-else class="knowledge-notes-empty-state">
      <p>选择一篇笔记开始阅读，或创建新笔记</p>
    </div>
  </div>
</template>
