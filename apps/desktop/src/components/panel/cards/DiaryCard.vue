<script setup lang="ts">
// Static MVP — hardcoded diary content
const chips = [
  { label: "助手日记预览", variant: "blue" },
  { label: "本周 7 篇", variant: "black" },
];

const meta = { date: "06·12 周四", stats: "2h 18min · 3 段专注" };

const snippet =
  `今天你大半天都在和 borrow checker 对话，傍晚那杯冷掉的咖啡还在键盘旁边。我在 16:40 提醒过你休息，你说“再写一段就好”，结果一写就是四十分钟——但代码总算编过去了。明天可以从把热区代理窗口的尺寸常量挪到配置文件开始。`;
</script>

<template>
  <div class="card card-grad">
    <div class="chips">
      <span v-for="chip in chips" :key="chip.label" :class="['chip', chip.variant]">
        {{ chip.label }}
      </span>
    </div>

    <div class="nc-diary">
      <div class="nc-diary-meta">
        <span>{{ meta.date }}</span>
        <span>·</span>
        <span>{{ meta.stats }}</span>
      </div>
      <p class="nc-diary-snippet">{{ snippet }}</p>
    </div>

    <div class="card-foot" style="padding-top: 8px">
      <span style="font-size: 0.72rem; color: #6b7280">由助手在 22:14 自动生成</span>
      <span class="badge" style="background: #f3f3f3; width: 34px; height: 34px; font-size: 0.78rem">→</span>
    </div>
  </div>
</template>
