<script setup lang="ts">
import type { MountMode } from "../../composables/useSettings";

interface MountOption {
  value: MountMode;
  icon: string;
  title: string;
  desc: string;
}

defineProps<{
  modelValue: MountMode;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: MountMode): void;
}>();

const OPTIONS: MountOption[] = [
  { value: "tcp", icon: "🔌", title: "本地 TCP 端口", desc: "默认模式 · 兼容性最佳" },
  { value: "uds", icon: "🔒", title: "零端口 UDS", desc: "无端口冲突 · 绕过防火墙" },
  { value: "remote", icon: "☁️", title: "远程宿主", desc: "算力卸载 · NAS / 云端" },
];
</script>

<template>
  <div class="mount-modes">
    <button
      v-for="opt in OPTIONS"
      :key="opt.value"
      type="button"
      class="mount-card"
      :class="{ selected: modelValue === opt.value }"
      @click="emit('update:modelValue', opt.value)"
    >
      <div class="mount-card-icon">{{ opt.icon }}</div>
      <div class="mount-card-title">{{ opt.title }}</div>
      <div class="mount-card-desc">{{ opt.desc }}</div>
    </button>
  </div>
</template>

<style scoped>
.mount-card {
  font-family: inherit;
  color: inherit;
}
</style>
