<script setup lang="ts">
import { ref } from "vue";
import type { Task } from "@neo-companion/shared";

defineProps<{
  tasks: Task[];
  completedCount: number;
  totalCount: number;
  focusDuration: string;
  newTaskTitle: string;
  activeTaskId: string | null;
}>();

const emit = defineEmits<{
  addTask: [];
  toggleTask: [task: Task];
  "update:newTaskTitle": [value: string];
  "update:activeTaskId": [id: string];
}>();

const adding = ref(false);

function submitTask() {
  emit("addTask");
  adding.value = false;
}
</script>

<template>
  <div class="card card-solid">
    <div class="card-head">
      <div>
        <div class="card-title">今日任务</div>
        <div class="card-sub">{{ totalCount - completedCount }} 项待办 · {{ completedCount }} 项已完成</div>
      </div>
      <svg style="opacity: 0.5; flex: none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 11l3 3 8-8" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    </div>

    <ul v-if="tasks.length" class="nc-tasks">
      <li
        v-for="task in tasks"
        :key="task.id"
        :class="['nc-task', task.status === 'done' ? 'done' : task.id === activeTaskId ? 'run' : '']"
        @click="task.status === 'open' && emit('update:activeTaskId', task.id)"
      >
        <span class="dot"></span>
        <span class="label">{{ task.title }}</span>
        <button class="task-mini-action" type="button" @click.stop="emit('toggleTask', task)">
          {{ task.status === "done" ? "恢复" : "完成" }}
        </button>
      </li>
    </ul>
    <div v-else class="nc-empty-state">
      <span>还没有任务</span>
      <small>添加一件小事，或直接开始一段无任务专注。</small>
    </div>

    <form v-if="adding" class="nc-task-add" @submit.prevent="submitTask">
      <input
        :value="newTaskTitle"
        type="text"
        placeholder="写下下一件小事"
        @input="emit('update:newTaskTitle', ($event.target as HTMLInputElement).value)"
      />
      <button type="submit">添加</button>
    </form>

    <div class="card-foot" style="padding-top: 14px">
      <span style="font-size: 0.75rem; color: var(--panel-muted)">今日累计 {{ focusDuration }}</span>
      <button class="badge" type="button" style="font-size: 0.85rem" @click.stop="adding = !adding">＋</button>
    </div>
  </div>
</template>
