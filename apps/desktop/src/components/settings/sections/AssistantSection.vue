<script setup lang="ts">
import type { SettingsState } from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import ToggleSwitch from "../ToggleSwitch.vue";
import SelectField from "../SelectField.vue";

defineProps<{
  state: SettingsState;
}>();

const THEME_OPTIONS = [
  { value: "default" as const, label: "默认助手" },
  { value: "bongo-cat" as const, label: "Bongo Cat" },
  { value: "pixel" as const, label: "像素风" },
  { value: "import" as const, label: "导入主题…" },
];

const SIZE_OPTIONS = [
  { value: "small" as const, label: "小 (240×400)" },
  { value: "medium" as const, label: "中 (320×540)" },
  { value: "large" as const, label: "大 (400×640)" },
];
</script>

<template>
  <div class="section-panel">
    <div class="settings-section solid-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M10 4C7.5 4 5.5 6 5.5 8.5c0 1.5.7 2.8 1.8 3.7V14l2.7-1 2.7 1v-1.8c1.1-.9 1.8-2.2 1.8-3.7C14.5 6 12.5 4 10 4z" />
            <path d="M7 16h6" />
          </svg>
        </div>
        <div>
          <div class="section-title">助手形象</div>
          <div class="section-desc">外观主题与壁纸层显示设置</div>
        </div>
      </div>

      <SettingRow label="形象主题" hint="选择助手的 2D 精灵图主题，支持社区导入">
        <template #action>
          <SelectField v-model="state.assistantTheme.value" :options="THEME_OPTIONS" />
        </template>
      </SettingRow>

      <SettingRow label="助手窗口大小" hint="调整悬浮助手的显示尺寸">
        <template #action>
          <SelectField v-model="state.assistantSize.value" :options="SIZE_OPTIONS" />
        </template>
      </SettingRow>

      <SettingRow label="TTS 语音反馈" hint="启用助手的拟人化语音播报">
        <template #action>
          <ToggleSwitch v-model="state.ttsEnabled.value" />
        </template>
      </SettingRow>

      <SettingRow label="壁纸状态显示" hint="在桌面壁纸层展示天气时间、任务清单与专注主控盘">
        <template #action>
          <ToggleSwitch v-model="state.wallpaperStatusEnabled.value" />
        </template>
      </SettingRow>

      <SettingRow label="壁纸氛围色调" hint="根据专注/分心/疲劳状态自动微调壁纸色调">
        <template #action>
          <ToggleSwitch v-model="state.wallpaperAmbientTint.value" />
        </template>
      </SettingRow>

      <SettingRow label="沉浸模式" hint="一键隐藏 UI，仅保留极淡状态提示">
        <template #action>
          <ToggleSwitch v-model="state.immersiveMode.value" />
        </template>
      </SettingRow>

      <SettingRow label="专注时自动进入沉浸模式" hint="开始番茄钟时自动切换沉浸模式">
        <template #action>
          <ToggleSwitch v-model="state.focusAutoImmersive.value" />
        </template>
      </SettingRow>
    </div>
  </div>
</template>
