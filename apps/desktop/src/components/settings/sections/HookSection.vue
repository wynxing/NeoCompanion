<script setup lang="ts">
import type { SettingsState } from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import ToggleSwitch from "../ToggleSwitch.vue";
import TextField from "../TextField.vue";
import HookStatusDot from "../HookStatusDot.vue";
import KeyBadge from "../KeyBadge.vue";

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
            <path d="M10 2v6m0 0a4 4 0 110 8m0-8a4 4 0 100 8" />
            <path d="M10 16v2" />
          </svg>
        </div>
        <div>
          <div class="section-title">Hook 与连接</div>
          <div class="section-desc">自定义状态推送、审批机制与快捷键</div>
        </div>
      </div>

      <SettingRow label="Hook API 服务" hint="允许外部脚本通过 HTTP API 或文件监听向助手推送状态">
        <template #action>
          <ToggleSwitch v-model="state.hookApiEnabled.value" />
        </template>
      </SettingRow>

      <SettingRow label="服务端口" hint="Hook API 监听的本地端口号，仅在 TCP 模式下生效">
        <template #action>
          <TextField v-model="state.hookPort.value" max-width="100px" align="center" />
        </template>
      </SettingRow>

      <SettingRow
        label="文件监听哨兵"
        hint="监听 ~/.neo-companion/hooks/ 目录，脚本写入 JSON 即可触发助手反馈"
      >
        <template #action>
          <HookStatusDot :active="state.hookSentinelActive.value" />
        </template>
      </SettingRow>

      <SettingRow label="自动扫描注入" hint="启动时自动检测外部 Agent 工具配置并注入 Hook 端点">
        <template #action>
          <ToggleSwitch v-model="state.autoScanInject.value" />
        </template>
      </SettingRow>

      <SettingRow label="浮动权限审批" hint="外部 Agent 请求敏感操作时弹出半透明审批卡片">
        <template #action>
          <ToggleSwitch v-model="state.floatingApproval.value" />
        </template>
      </SettingRow>

      <SettingRow label="审批快捷键" hint="无需点击浮窗，直接用全局热键快速响应">
        <template #action>
          <div style="display: flex; gap: 8px; align-items: center">
            <KeyBadge combo="Ctrl+Shift+Y" />
            <span style="font-size: 11px; color: var(--text-muted)">同意</span>
            <KeyBadge combo="Ctrl+Shift+N" />
            <span style="font-size: 11px; color: var(--text-muted)">拒绝</span>
          </div>
        </template>
      </SettingRow>

      <SettingRow label="MQTT / 智能家居" hint="订阅局域网 MQTT 消息队列，联动智能家居传感器">
        <template #action>
          <div style="display: flex; align-items: center; gap: 8px">
            <ToggleSwitch v-model="state.mqttEnabled.value" />
            <span class="badge badge-orange">v2</span>
          </div>
        </template>
      </SettingRow>

    </div>
  </div>
</template>
