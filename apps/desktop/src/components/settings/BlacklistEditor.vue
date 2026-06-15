<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  items: string[];
}>();

const emit = defineEmits<{
  (event: "remove", name: string): void;
  (event: "add", name: string): void;
}>();

const draftName = ref("");
const isAdding = ref(false);

function startAdd(): void {
  isAdding.value = true;
}

function commitAdd(): void {
  if (draftName.value.trim()) {
    emit("add", draftName.value);
  }
  draftName.value = "";
  isAdding.value = false;
}

function cancelAdd(): void {
  draftName.value = "";
  isAdding.value = false;
}
</script>

<template>
  <div style="padding: 0 0 4px">
    <div v-for="item in items" :key="item" class="blacklist-item">
      <div class="blacklist-name">{{ item }}</div>
      <button
        type="button"
        class="blacklist-remove"
        title="移除"
        @click="emit('remove', item)"
      >
        ×
      </button>
    </div>

    <div v-if="isAdding" style="display: flex; gap: 8px; align-items: center; margin-top: 8px">
      <input
        v-model="draftName"
        class="text-input"
        placeholder="应用名称"
        style="max-width: 200px"
        @keyup.enter="commitAdd"
        @keyup.escape="cancelAdd"
      />
      <button type="button" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px" @click="commitAdd">
        添加
      </button>
      <button type="button" class="btn btn-ghost" style="padding: 6px 10px; font-size: 12px" @click="cancelAdd">
        取消
      </button>
    </div>
    <button
      v-else
      type="button"
      class="btn btn-secondary"
      style="margin-top: 8px; font-size: 12px"
      @click="startAdd"
    >
      + 添加应用
    </button>
  </div>
</template>
