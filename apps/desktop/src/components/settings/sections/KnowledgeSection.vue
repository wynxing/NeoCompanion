<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  EmbeddingProvider,
  SearchScope,
  SettingsState,
} from "../../../composables/useSettings";
import { open } from "@tauri-apps/plugin-dialog";
import SettingRow from "../SettingRow.vue";
import ToggleSwitch from "../ToggleSwitch.vue";
import TextField from "../TextField.vue";
import SelectField from "../SelectField.vue";

const props = defineProps<{
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

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const picking = ref(false);
const saving = ref(false);

const rootPathDisplay = computed(() => props.state.knowledgeRootPath.value || "未选择");

onMounted(() => {
  void props.state.loadEmbeddingConfig();
  void props.state.loadKnowledgeRootPath();
});

async function pickRootFolder(): Promise<void> {
  if (!isTauri || picking.value) return;
  picking.value = true;
  try {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) {
      await props.state.setKnowledgeRootPath(selected);
    }
  } catch (error) {
    props.state.knowledgeMirrorError.value = true;
    props.state.knowledgeMirrorMessage.value = error instanceof Error ? error.message : "设置知识库根目录失败";
  } finally {
    picking.value = false;
  }
}

async function saveEmbeddingConfig(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    await props.state.saveEmbeddingConfig();
  } finally {
    saving.value = false;
  }
}
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

      <SettingRow
        label="知识库根目录"
        hint="Markdown 文件镜像的根目录；SQLite 仍是业务数据与索引的主存储"
      >
        <template #action>
          <div class="knowledge-root-action">
            <input
              class="text-input knowledge-root-path"
              :value="rootPathDisplay"
              readonly
              :title="state.knowledgeRootPath.value"
            />
            <button
              type="button"
              class="btn-ghost"
              :disabled="!isTauri || picking"
              :title="isTauri ? '' : '需在桌面端选择'"
              @click="pickRootFolder"
            >
              选择文件夹
            </button>
          </div>
        </template>
      </SettingRow>

      <SettingRow label="文件镜像" hint="SQLite 为主存储；手动导入或导出 Markdown 镜像，不同步文件删除">
        <template #action>
          <div class="knowledge-root-action">
            <button type="button" class="btn-ghost" :disabled="state.knowledgeMirrorBusy.value || !state.knowledgeRootPath.value" @click="state.importKnowledgeMirror">
              导入
            </button>
            <button type="button" class="btn-ghost" :disabled="state.knowledgeMirrorBusy.value || !state.knowledgeRootPath.value" @click="state.exportKnowledgeMirror">
              导出
            </button>
          </div>
        </template>
      </SettingRow>

      <p
        v-if="state.knowledgeMirrorMessage.value"
        class="knowledge-mirror-status"
        :class="{ 'is-error': state.knowledgeMirrorError.value }"
        role="status"
      >
        {{ state.knowledgeMirrorMessage.value }}
      </p>

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

      <SettingRow label="Embedding API Base URL" hint="OpenAI 兼容端点；留空使用 Provider 默认">
        <template #action>
          <TextField v-model="state.embeddingBaseUrl.value" placeholder="https://api.openai.com" />
        </template>
      </SettingRow>

      <SettingRow label="Embedding API Key" hint="由系统钥匙链保存；Sidecar 仅在进程内存中使用">
        <template #action>
          <TextField
            v-model="state.embeddingApiKey.value"
            type="password"
            :placeholder="state.embeddingConfigured.value ? '已配置（留空保持不变）' : 'sk-...'"
          />
        </template>
      </SettingRow>

      <SettingRow label="保存 Embedding 配置" hint="推送至本地服务端并触发后台向量索引">
        <template #action>
          <button type="button" class="btn-ghost" :disabled="saving" @click="saveEmbeddingConfig">
            保存配置
          </button>
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
