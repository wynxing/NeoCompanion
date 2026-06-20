<script setup lang="ts">
import { computed } from "vue";
import type { KnowledgeWorkspaceState } from "../../composables/useKnowledgeWorkspace";
import ProjectCard from "./ProjectCard.vue";

const props = defineProps<{
  workspace: KnowledgeWorkspaceState;
}>();

const emit = defineEmits<{
  enter: [id: string];
}>();

const displayProjects = computed(() => {
  if (props.workspace.currentProjectId.value) {
    return props.workspace.childProjects.value;
  }
  return props.workspace.projects.value.filter((p) => p.parentId === null);
});

function childCount(id: string): number {
  return props.workspace.childProjectsOf(id).length;
}

function noteCount(id: string): number {
  return props.workspace.countNotes(id);
}

function taskCount(id: string): number {
  return props.workspace.countTasks(id);
}
</script>

<template>
  <section class="project-browser" aria-label="项目浏览器">
    <div v-if="displayProjects.length === 0" class="project-browser-empty">
      <p>这里还没有项目</p>
      <small>进入工作区后可创建子项目或笔记</small>
    </div>

    <div v-else class="project-grid">
      <ProjectCard
        v-for="project in displayProjects"
        :key="project.id"
        :project="project"
        :child-count="childCount(project.id)"
        :note-count="noteCount(project.id)"
        :task-count="taskCount(project.id)"
        @enter="emit('enter', $event)"
      />
    </div>
  </section>
</template>
