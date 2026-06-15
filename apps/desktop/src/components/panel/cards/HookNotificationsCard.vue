<script setup lang="ts">
// Static MVP — hardcoded hook notifications
const hooks = [
  { src: "claude", msg: "写入 ~/.config/app — 待审批", status: "pending" as const, label: "需确认" },
  { src: "vite", msg: "构建失败：3 个类型错误", status: "pending" as const, label: "×3" },
  { src: "file", msg: "watcher：deploy.log 已更新", status: "ok" as const, label: "已读" },
];
</script>

<template>
  <div class="card nc-wrap-glass">
    <div class="card-head">
      <div>
        <div class="card-title">Hook 通知</div>
        <div class="card-sub">预览 · 2 条待审批</div>
      </div>
      <svg style="opacity: 0.5; flex: none" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
    </div>

    <div class="nc-hooks">
      <div v-for="hook in hooks" :key="hook.src + hook.msg" class="nc-hook">
        <span class="src">{{ hook.src }}</span>
        <span class="msg">{{ hook.msg }}</span>
        <span v-if="hook.status === 'pending'" class="pend">{{ hook.label }}</span>
        <span v-else class="ok">{{ hook.label }}</span>
      </div>
    </div>

    <div class="card-foot" style="padding-top: 12px">
      <span style="font-size: 0.72rem; opacity: 0.65; font-family: ui-monospace, Menlo, monospace">
        Ctrl+Shift+Y / N 快捷审批
      </span>
    </div>
  </div>
</template>
