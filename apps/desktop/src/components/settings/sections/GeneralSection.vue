<script setup lang="ts">
import type { SettingsState } from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import ToggleSwitch from "../ToggleSwitch.vue";
import SelectField from "../SelectField.vue";
import MountModeCards from "../MountModeCards.vue";

defineProps<{
  state: SettingsState;
}>();

const LANGUAGE_OPTIONS = [
  { value: "zh-CN" as const, label: "简体中文" },
  { value: "en-US" as const, label: "English" },
  { value: "ja-JP" as const, label: "日本語" },
];
</script>

<template>
  <div class="section-panel">
    <div class="settings-section solid-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="10" cy="10" r="3" />
            <path d="M10 2v2m0 12v2m-8-8h2m12 0h2m-2.5-5.5L14 5m-9 9l-1.5 1.5m0-12L5 5m9 9l1.5 1.5" />
          </svg>
        </div>
        <div>
          <div class="section-title">通用设置</div>
          <div class="section-desc">语言、启动行为与挂载模式</div>
        </div>
      </div>

      <SettingRow label="界面语言" hint="设置助手界面和反馈的语言">
        <template #action>
          <SelectField v-model="state.language.value" :options="LANGUAGE_OPTIONS" />
        </template>
      </SettingRow>

      <SettingRow label="开机自动启动" hint="系统启动时自动运行 NeoCompanion">
        <template #action>
          <ToggleSwitch v-model="state.autoStart.value" />
        </template>
      </SettingRow>

      <SettingRow label="启动时最小化到托盘" hint="开机自启后不显示主窗口，仅在系统托盘可见">
        <template #action>
          <ToggleSwitch v-model="state.minimizeToTray.value" />
        </template>
      </SettingRow>

      <SettingRow label="挂载模式" hint="选择后端服务的通信方式，影响端口占用与安全性" />

      <MountModeCards v-model="state.mountMode.value" />
    </div>
  </div>
</template>
