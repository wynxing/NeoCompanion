<script setup lang="ts">
import type { SettingsState } from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import ToggleSwitch from "../ToggleSwitch.vue";
import BlacklistEditor from "../BlacklistEditor.vue";

defineProps<{
  state: SettingsState;
}>();
</script>

<template>
  <div class="section-panel">
    <div class="settings-section glass-panel">
      <div class="section-header">
        <div class="section-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="8" width="14" height="10" rx="2" />
            <path d="M6 8V5a4 4 0 0112 0v3" />
          </svg>
        </div>
        <div>
          <div class="section-title">隐私安全</div>
          <div class="section-desc">屏幕感知、数据管理与隐私控制</div>
        </div>
      </div>

      <SettingRow label="窗口检测" hint="检测当前活跃窗口以感知专注/分心状态，仅提取应用类型">
        <template #action>
          <ToggleSwitch v-model="state.windowDetection.value" />
        </template>
      </SettingRow>

      <SettingRow label="应用事件记录" hint="记录应用切换和窗口焦点变化">
        <template #action>
          <ToggleSwitch v-model="state.appEventLogging.value" />
        </template>
      </SettingRow>

      <SettingRow label="屏幕内容获取" hint="在授权下获取屏幕内容摘要，所有处理均在本地完成">
        <template #action>
          <div style="display: flex; align-items: center; gap: 8px">
            <ToggleSwitch v-model="state.screenContentCapture.value" />
            <span class="badge badge-orange">v2</span>
          </div>
        </template>
      </SettingRow>

      <SettingRow label="应用黑名单" hint="黑名单内的应用不会被检测或记录" />

      <BlacklistEditor
        :items="state.blacklist.value"
        @remove="state.removeBlacklistItem"
        @add="state.addBlacklistItem"
      />

      <div style="margin-top: 8px">
        <SettingRow label="查看 AI 上下文" hint="预览将要发送给 AI 的上下文内容">
          <template #action>
            <button type="button" class="btn btn-secondary">预览</button>
          </template>
        </SettingRow>

        <SettingRow label="数据管理" hint="导出、清除或备份本地数据">
          <template #action>
            <div style="display: flex; gap: 6px">
              <button type="button" class="btn btn-secondary">导出</button>
              <button type="button" class="btn btn-danger">清除数据</button>
            </div>
          </template>
        </SettingRow>
      </div>
    </div>
  </div>
</template>
