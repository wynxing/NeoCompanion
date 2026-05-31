<script setup lang="ts">
import type { Task } from "@neo-companion/shared";

defineProps<{
  tasks: Task[];
  completedCount: number;
  totalCount: number;
  newTaskTitle: string;
  activeTaskId: string | null;
}>();

defineEmits<{
  "update:newTaskTitle": [value: string];
  addTask: [];
  toggleTask: [task: Task];
  "update:activeTaskId": [id: string];
}>();
</script>

<template>
  <section class="drawer-panel task-panel">
    <div class="panel-line">
      <div class="task-panel-title">
        <h2>任务小账本</h2>
        <span class="count">{{ completedCount }}/{{ totalCount }}</span>
      </div>
    </div>

    <form class="task-form" @submit.prevent="$emit('addTask')">
      <input :value="newTaskTitle" placeholder="写下下一件小事" @input="$emit('update:newTaskTitle', ($event.target as HTMLInputElement).value)" />
      <button type="submit">添加</button>
    </form>

    <div class="task-list">
      <label v-for="task in tasks" :key="task.id" :class="['task-item', task.status, { active: activeTaskId === task.id && task.status === 'open' }]">
        <input
          class="task-radio"
          type="radio"
          :name="'task-select'"
          :value="task.id"
          :checked="activeTaskId === task.id && task.status === 'open'"
          :disabled="task.status === 'done'"
          @change="$emit('update:activeTaskId', task.id)"
        />
        <span class="task-title">{{ task.title }}</span>
        <button class="task-toggle" type="button" @click="$emit('toggleTask', task)">
          {{ task.status === "done" ? "恢复" : "完成" }}
        </button>
      </label>
    </div>
  </section>
</template>
