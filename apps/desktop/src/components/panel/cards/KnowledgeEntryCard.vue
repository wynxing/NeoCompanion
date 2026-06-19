<script setup lang="ts">
import { useKnowledgeMock } from "../../../composables/useKnowledgeMock";
import IndexStatusDot from "../../knowledge/IndexStatusDot.vue";

const knowledge = useKnowledgeMock();

const emit = defineEmits<{
  openKnowledge: [];
}>();

const stats = [
  { label: "当前项目", value: "产品研究" },
  { label: "笔记", value: "12" },
  { label: "任务", value: "8" },
  { label: "上次索引", value: "1 分钟前" },
];
</script>

<template>
  <div class="card card-glass-dark">
    <div class="card-head">
      <div>
        <div class="card-title">知识工作空间</div>
        <div class="card-sub">项目 · 笔记 · 看板 · 引用回答</div>
      </div>
      <IndexStatusDot :status="knowledge.indexStatus.value" :show-label="false" />
    </div>

    <div class="nc-knowledge-stats">
      <div v-for="stat in stats" :key="stat.label" class="nc-knowledge-stat">
        <span class="value">{{ stat.value }}</span>
        <span class="label">{{ stat.label }}</span>
      </div>
    </div>

    <p class="nc-knowledge-tip">
      在此沉淀笔记、推进任务，AI 回答会引用本地真实笔记，不会编造来源。
    </p>

    <div class="card-foot" style="padding-top: 14px">
      <span class="nc-knowledge-status-line">
        <IndexStatusDot :status="knowledge.indexStatus.value" />
      </span>
      <button type="button" class="nc-knowledge-open-btn" @click="emit('openKnowledge')">
        打开工作空间
      </button>
    </div>
  </div>
</template>
