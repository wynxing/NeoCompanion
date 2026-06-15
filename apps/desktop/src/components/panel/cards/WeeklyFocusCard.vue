<script setup lang="ts">
const emit = defineEmits<{
  startFocus: [];
}>();

// Static MVP data — paired bars for each weekday
const blueBars = [35, 45, 30, 55, 40, 65, 50];
const greyBars = [45, 70, 60, 75, 55, 65, 50];

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
const barData = weekDays.map((day, i) => ({
  day,
  blue: blueBars[i],
  grey: greyBars[i],
}));
</script>

<template>
  <div class="card card-solid">
    <div class="card-title">本周专注</div>
    <div class="bars">
      <template v-for="(day, index) in barData" :key="index">
        <span :style="{ height: day.blue + '%', background: '#3b82f6' }"></span>
        <span :style="{ height: day.grey + '%', background: '#d8dee8' }"></span>
      </template>
    </div>
    <div
      class="markers"
      style="
        font-size: 0.7rem;
        color: var(--panel-muted);
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.06em;
        padding: 0 4px;
        margin: 14px 0 0;
      "
    >
      <span v-for="day in weekDays" :key="day">{{ day }}</span>
    </div>
    <div class="card-foot" style="padding-top: 14px; align-items: center">
      <div>
        <!-- TODO: 接入真实数据 -->
        <div style="font-size: 1.6rem; font-weight: 500; letter-spacing: -0.02em">
          12h 40<span style="font-size: 0.95rem; opacity: 0.55">min</span>
        </div>
        <div style="font-size: 0.7rem; color: var(--panel-muted); margin-top: 2px">较上周 +1h 50min</div>
      </div>
      <button class="play-btn" type="button" style="background: var(--blue); color: #fff" title="开始本次专注" @click="emit('startFocus')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </div>
  </div>
</template>
