<script setup lang="ts">
import type { SettingsState } from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import ModelGrid from "../ModelGrid.vue";
import TextField from "../TextField.vue";
import SelectField from "../SelectField.vue";

defineProps<{
  state: SettingsState;
}>();

const TTS_OPTIONS = [
  { value: "edge" as const, label: "Edge TTS（推荐）" },
  { value: "openai" as const, label: "OpenAI TTS" },
  { value: "system" as const, label: "系统内置（离线）" },
];
</script>

<template>
  <div class="section-panel">
    <div class="settings-section solid-card">
      <div class="section-header">
        <div class="section-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 14l7-10 7 10" />
            <path d="M10 4v12" />
            <path d="M6 11h8" />
          </svg>
        </div>
        <div>
          <div class="section-title">模型配置</div>
          <div class="section-desc">选择 AI 对话与辅助的默认模型</div>
        </div>
      </div>

      <SettingRow label="默认对话模型" hint="AI 聊天与代码辅助使用的主模型" />

      <ModelGrid v-model="state.selectedModel.value" />

      <div style="margin-top: 16px">
        <SettingRow label="API Key" hint="密钥通过系统钥匙链安全存储，绝不会明文保存">
          <template #action>
            <div style="display: flex; gap: 8px; align-items: center">
              <span class="api-key-masked">{{ state.apiKeyMasked.value }}</span>
              <button type="button" class="btn btn-ghost" style="padding: 6px 10px; font-size: 12px">
                更换
              </button>
            </div>
          </template>
        </SettingRow>

        <SettingRow label="自定义 API 端点" hint='仅在选择"自定义端点"模型时生效'>
          <template #action>
            <TextField
              v-model="state.customApiEndpoint.value"
              placeholder="https://api.example.com/v1"
              max-width="240px"
            />
          </template>
        </SettingRow>

        <SettingRow label="TTS 语音引擎" hint="在线时使用云端高拟真引擎，离线自动降级到系统内置">
          <template #action>
            <SelectField v-model="state.ttsEngine.value" :options="TTS_OPTIONS" />
          </template>
        </SettingRow>
      </div>
    </div>
  </div>
</template>
