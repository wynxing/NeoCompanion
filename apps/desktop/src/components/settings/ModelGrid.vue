<script setup lang="ts">
import type { ModelKey } from "../../composables/useSettings";

interface ModelEntry {
  value: ModelKey;
  name: string;
  provider: string;
  badge?: { text: string; tone: "green" | "orange" };
}

defineProps<{
  modelValue: ModelKey;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: ModelKey): void;
}>();

const MODELS: ModelEntry[] = [
  {
    value: "deepseek",
    name: "DeepSeek Chat",
    provider: "DeepSeek · 内置默认",
    badge: { text: "推荐", tone: "green" },
  },
  { value: "claude", name: "Claude Sonnet", provider: "Anthropic" },
  { value: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  {
    value: "custom",
    name: "自定义端点",
    provider: "OpenAI 兼容 API",
    badge: { text: "高级", tone: "orange" },
  },
];
</script>

<template>
  <div class="model-grid">
    <button
      v-for="entry in MODELS"
      :key="entry.value"
      type="button"
      class="model-card"
      :class="{ selected: modelValue === entry.value }"
      @click="emit('update:modelValue', entry.value)"
    >
      <div class="model-radio">
        <div class="model-radio-inner"></div>
      </div>
      <div class="model-info">
        <div class="model-name">{{ entry.name }}</div>
        <div class="model-provider">{{ entry.provider }}</div>
      </div>
      <span
        v-if="entry.badge"
        class="badge"
        :class="entry.badge.tone === 'green' ? 'badge-green' : 'badge-orange'"
      >
        {{ entry.badge.text }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.model-card {
  font-family: inherit;
  color: inherit;
  text-align: left;
}
</style>
