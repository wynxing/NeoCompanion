<script setup lang="ts">
// Static MVP — hardcoded claw gateway data
const steps = [
  { label: "读取 Figma 链接 · 已认证", status: "done" as const },
  { label: "导出 12 张截图至本地缓存", status: "active" as const },
  { label: "整理为 Markdown 笔记", status: "pending" as const },
];

const progressPercent = 62;
</script>

<template>
  <div class="card card-glass-dark">
    <div class="card-head">
      <div>
        <div class="card-title">OpenClaw 网关</div>
        <div class="card-sub">预览 · 代行任务流程</div>
      </div>
      <svg style="opacity: 0.5; flex: none" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
      </svg>
    </div>

    <div class="nc-claw">
      <div v-for="step in steps" :key="step.label" :class="['nc-claw-step', step.status]">
        <span class="pin"></span>
        <span>{{ step.label }}</span>
      </div>
      <div class="progress">
        <i :style="{ width: progressPercent + '%' }"></i>
      </div>
    </div>

    <div class="card-foot" style="padding-top: 14px">
      <span style="font-size: 0.72rem; opacity: 0.65; font-variant-numeric: tabular-nums">
        已运行 02:14 · 预计还需 01:30
      </span>
    </div>
  </div>
</template>
