<script setup lang="ts">
import MiniPetAvatar from "./MiniPetAvatar.vue";
import type { CompanionState, Task } from "@neo-companion/shared";

defineProps<{
  petState: CompanionState;
  currentTask: Task | null;
}>();

defineEmits<{
  hide: [];
}>();
</script>

<template>
  <header class="panel-header" data-tauri-drag-region>
    <div class="panel-header-left">
      <MiniPetAvatar :state="petState" />
      <div class="panel-header-text">
        <p class="eyebrow">今天</p>
        <h1>{{ currentTask?.title ?? "先选一件小事" }}</h1>
      </div>
    </div>
    <button class="ghost" type="button" @click="$emit('hide')">收起</button>
  </header>
</template>
