<script setup lang="ts">
import type { KnowledgeTask } from "../../composables/useKnowledgeMock";

defineProps<{
  tasks: KnowledgeTask[];
}>();

const STATUS_LABEL: Record<KnowledgeTask["status"], string> = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  archived: "已归档",
};
</script>

<template>
  <div class="knowledge-tasks-pane">
    <p class="knowledge-tasks-tip">
      统一任务视图：与看板共享同一份数据，便于平铺浏览。
    </p>
    <ul class="knowledge-task-list">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="knowledge-task-row"
        :data-status="task.status"
      >
        <span class="status-pill">{{ STATUS_LABEL[task.status] }}</span>
        <span class="title">{{ task.title }}</span>
        <span class="tags">
          <span v-for="tag in task.tags" :key="tag" class="tag">{{ tag }}</span>
          <span v-if="task.linkedNoteId" class="linked" title="关联笔记">↳ 笔记</span>
        </span>
      </li>
    </ul>
  </div>
</template>
