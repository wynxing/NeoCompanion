<script setup lang="ts">
import { ref } from "vue";
import { useKnowledgeMock } from "../composables/useKnowledgeMock";
import ProjectSidebar from "../components/knowledge/ProjectSidebar.vue";
import KnowledgeTopbar from "../components/knowledge/KnowledgeTopbar.vue";
import NotesPane from "../components/knowledge/NotesPane.vue";
import BoardPane from "../components/knowledge/BoardPane.vue";
import TasksPane from "../components/knowledge/TasksPane.vue";

const knowledge = useKnowledgeMock();
const editing = ref(false);

function toggleEditing(): void {
  editing.value = !editing.value;
}

function handleBodyUpdate(body: string): void {
  if (!knowledge.activeNoteId.value) return;
  knowledge.setNoteBody(knowledge.activeNoteId.value, body);
}
</script>

<template>
  <div class="knowledge-root" data-view="knowledge">
    <ProjectSidebar
      :projects="knowledge.projects.value"
      :active-project-id="knowledge.activeProjectId.value"
      @select="knowledge.selectProject"
    />

    <main class="knowledge-main">
      <KnowledgeTopbar
        :project="knowledge.activeProject.value"
        :active-view="knowledge.activeView.value"
        :search-query="knowledge.searchQuery.value"
        :index-status="knowledge.indexStatus.value"
        @select-view="knowledge.selectView"
        @update:search-query="knowledge.searchQuery.value = $event"
      />

      <div v-if="knowledge.activeView.value === 'notes'" class="knowledge-edit-strip">
        <button
          type="button"
          class="preview-edit"
          :class="{ 'is-editing': editing }"
          :disabled="!knowledge.activeNote.value"
          @click="toggleEditing"
        >
          {{ editing ? "完成" : "编辑" }}
        </button>
      </div>

      <div class="knowledge-content-scroll">
        <NotesPane
          v-if="knowledge.activeView.value === 'notes'"
          :notes="knowledge.projectNotes.value"
          :active-note="knowledge.activeNote.value"
          :editable="editing"
          @select="knowledge.selectNote"
          @update:body="handleBodyUpdate"
        />

        <BoardPane
          v-else-if="knowledge.activeView.value === 'board'"
          :columns="knowledge.boardColumns.value"
          :tasks="knowledge.projectTasks.value"
        />

        <TasksPane v-else :tasks="knowledge.projectTasks.value" />
      </div>
    </main>
  </div>
</template>
