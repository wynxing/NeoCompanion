<script setup lang="ts">
import type {
  EmbeddingProvider,
  SearchScope,
  SettingsState,
} from "../../../composables/useSettings";
import SettingRow from "../SettingRow.vue";
import ToggleSwitch from "../ToggleSwitch.vue";
import TextField from "../TextField.vue";
import SelectField from "../SelectField.vue";

defineProps<{
  state: SettingsState;
}>();

const providerOptions: { value: EmbeddingProvider; label: string }[] = [
  { value: "none", label: "未配置（仅 FTS5 全文检索）" },
  { value: "openai", label: "OpenAI Embeddings" },
  { value: "cohere", label: "Cohere" },
  { value: "local", label: "本地模型（v3 阶段）" },
];

const scopeOptions: { value: SearchScope; label: string }[] = [
  { value: "current", label: "当前项目" },
  { value: "all", label: "全部项目" },
];
</script>

<template>
  <div class="section-panel">
    <div class="settings-section glass-panel">
      <div class="section-header">
        <div class="section-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 5a2 2 0 012-2h11l3 3v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
            <path d="M8 8h6M8 12h6M8 16h4" />
          </svg>
        </div>
        <div>
          <div class="section-title">知识库</div>
          <div class="section-desc">本地笔记 / 看板与 AI 检索的索引、范围与降级策略</div>
        </div>
      </div>

      <SettingRow label="Embedding Provider" hint="未配置时 AI 检索退化为仅 FTS5 全文搜索；笔记与看板始终可用">
        <template #action>
          <SelectField v-model="state.embeddingProvider.value" :options="providerOptions" />
        </template>
      </SettingRow>

      <SettingRow label="Embedding 模型名" hint="如 text-embedding-3-small；留空使用 Provider 默认值">
        <template #action>
          <TextField v-model="state.embeddingModel.value" placeholder="text-embedding-3-small" />
        </template>
      </SettingRow>

      <SettingRow label="默认检索范围" hint="AI 对话可临时切换；这里设置打开 AI 卡时的初始范围">
        <template #action>
          <SelectField v-model="state.searchScope.value" :options="scopeOptions" />
        </template>
      </SettingRow>

      <SettingRow label="分块大小（字符）" hint="Markdown 笔记按段落稳定分块；推荐 1200，过大降低检索精度">
        <template #action>
          <TextField v-model="state.chunkSize.value" max-width="100px" align="center" />
        </template>
      </SettingRow>

      <SettingRow label="自动重建索引" hint="模型或维度变化时自动把旧分块标记为 stale 并在后台重建">
        <template #action>
          <ToggleSwitch v-model="state.indexAutoRebuild.value" />
        </template>
      </SettingRow>

      <SettingRow label="立即重建索引" hint="清空向量索引并按当前 Provider 重新生成（不影响笔记内容）">
        <template #action>
          <button type="button" class="btn-ghost" @click="state.reindexAll">
            重建索引
          </button>
        </template>
      </SettingRow>
    </div>
  </div>
</template>
