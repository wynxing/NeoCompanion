<script setup lang="ts">
import type { SettingsState } from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import SelectField from "../SelectField.vue";

defineProps<{
  state: SettingsState;
}>();

const TONE_OPTIONS = [
  { value: "warm" as const, label: "温和专业" },
  { value: "concise" as const, label: "简洁高效" },
  { value: "humor" as const, label: "轻松幽默" },
  { value: "strict" as const, label: "严格督导" },
];

const NUDGE_OPTIONS = [
  { value: "once" as const, label: "仅一次" },
  { value: "gentle" as const, label: "温和重复" },
  { value: "persistent" as const, label: "持续提醒" },
];
</script>

<template>
  <div class="section-panel">
    <div class="settings-section glass-panel">
      <div class="section-header">
        <div class="section-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M5 15s1.5-3 5-3 5 3 5 3" />
            <circle cx="10" cy="7" r="3" />
          </svg>
        </div>
        <div>
          <div class="section-title">人设配置</div>
          <div class="section-desc">自定义助手的性格、语气与反馈风格</div>
        </div>
      </div>

      <SettingRow label="当前人设" hint="人设文件位于 ~/.NeoCompanion/soul.md，修改后自动热加载">
        <template #action>
          <span class="badge badge-green">{{ state.personaLoaded.value ? "已加载" : "未加载" }}</span>
        </template>
      </SettingRow>

      <div class="persona-preview">
        <div class="persona-preview-title">你是谁</div>
        <div class="persona-preview-text">
          你是 NeoCompanion，一个桌面上的智能助手。你温和、专业、偶尔轻松。你不撒娇、不卖萌、不哭闹。你像一个靠谱的搭档——话不多，但总在关键时候出现。
        </div>
        <div class="persona-preview-title" style="margin-top: 14px">你怎么说话</div>
        <div class="persona-preview-text">
          温和专业，不刻板也不油腻。简短优先：一句话能说清的不用两句。
        </div>
        <div class="persona-preview-actions">
          <button type="button" class="btn btn-primary">编辑人设</button>
          <button type="button" class="btn btn-secondary">恢复默认</button>
          <button type="button" class="btn btn-ghost">用外部编辑器打开</button>
        </div>
      </div>

      <div style="margin-top: 16px">
        <SettingRow label="语气风格" hint="快速调整助手交互的整体氛围">
          <template #action>
            <SelectField v-model="state.toneStyle.value" :options="TONE_OPTIONS" />
          </template>
        </SettingRow>

        <SettingRow label="催促频率" hint="分心时助手提醒的主动程度">
          <template #action>
            <SelectField v-model="state.nudgeFrequency.value" :options="NUDGE_OPTIONS" />
          </template>
        </SettingRow>
      </div>
    </div>
  </div>
</template>
