import { ref } from "vue";
import { api, bootstrapEmbeddingSecret } from "../api";
import { invoke } from "@tauri-apps/api/core";

/**
 * Settings composable — 阶段 1 仅维护本地状态，所有改动留在内存里。
 * 阶段 2 会接 `api.getSettings()` / `api.updateSettings()`，并加 `handleWsMessage`。
 *
 * 设计要点：保持与 usePetState / useFocus 一致的 "refs + functions" 形态，
 * 类型在文件内定义，等阶段 2 再迁到 @neo-companion/shared。
 */

export type SettingsSection =
  | "general"
  | "assistant"
  | "persona"
  | "model"
  | "privacy"
  | "knowledge"
  | "hooks";

export type MountMode = "tcp" | "uds" | "remote";
export type ModelKey = "deepseek" | "claude" | "gpt-4o" | "custom";
export type LanguageOption = "zh-CN" | "en-US" | "ja-JP";
export type AssistantSize = "small" | "medium" | "large";
export type AssistantTheme = "default" | "bongo-cat" | "pixel" | "import";
export type ToneStyle = "warm" | "concise" | "humor" | "strict";
export type NudgeFrequency = "once" | "gentle" | "persistent";
export type TtsEngine = "edge" | "openai" | "system";
export type CommandFrequency = string;
export type EmbeddingProvider = "none" | "openai" | "cohere" | "local";
export type SearchScope = "current" | "all";

export function useSettings() {
  const activeSection = ref<SettingsSection>("general");

  // —— 通用设置
  const language = ref<LanguageOption>("zh-CN");
  const autoStart = ref(true);
  const minimizeToTray = ref(false);
  const mountMode = ref<MountMode>("tcp");

  // —— 助手形象
  const assistantTheme = ref<AssistantTheme>("default");
  const assistantSize = ref<AssistantSize>("medium");
  const ttsEnabled = ref(true);
  const wallpaperStatusEnabled = ref(true);
  const wallpaperAmbientTint = ref(true);
  const immersiveMode = ref(false);
  const focusAutoImmersive = ref(false);

  // —— 人设配置
  const personaLoaded = ref(true);
  const toneStyle = ref<ToneStyle>("warm");
  const nudgeFrequency = ref<NudgeFrequency>("gentle");

  // —— 模型配置
  const selectedModel = ref<ModelKey>("deepseek");
  const apiKeyMasked = ref("");
  const customApiEndpoint = ref("");
  const ttsEngine = ref<TtsEngine>("edge");

  // —— 隐私安全
  const windowDetection = ref(true);
  const appEventLogging = ref(true);
  const screenContentCapture = ref(false);
  const blacklist = ref<string[]>(["1Password", "Bitwarden", "银行类应用"]);

  // —— Hook 与连接
  const hookApiEnabled = ref(true);
  const hookPort = ref("10103");
  const hookSentinelActive = ref(true);
  const autoScanInject = ref(true);
  const floatingApproval = ref(true);
  const mqttEnabled = ref(false);

  // —— 知识库（v3.3 新增；mock 状态，等 v2 接 sidecar 时迁出）
  const embeddingProvider = ref<EmbeddingProvider>("none");
  const embeddingModel = ref("");
  const embeddingBaseUrl = ref(
    typeof localStorage !== "undefined" ? localStorage.getItem("neo.embeddingBaseUrl") ?? "" : "",
  );
  // apiKey 仅存内存 + 推送服务端，不落 localStorage（敏感）
  const embeddingApiKey = ref("");
  const embeddingConfigured = ref(false);
  const embeddingApiKeySource = ref<"keychain" | "env" | "legacy" | "none">("none");
  const searchScope = ref<SearchScope>("current");
  const chunkSize = ref("1200");
  const indexAutoRebuild = ref(true);
  // 知识库根目录：阶段 0 仅记录路径并持久化到 localStorage，数据仍为 mock；
  // v2 文件化存储接入后由 sidecar 读取此路径作为笔记/索引落盘根目录。
  const knowledgeRootPath = ref("");
  const knowledgeMirrorBusy = ref(false);
  const knowledgeMirrorMessage = ref("");
  const knowledgeMirrorError = ref(false);

  async function loadEmbeddingConfig(): Promise<void> {
    try {
      await bootstrapEmbeddingSecret();
      const status = await api.knowledgeGetEmbeddingConfig();
      embeddingProvider.value = (status.provider as EmbeddingProvider) || "none";
      embeddingBaseUrl.value = status.baseUrl;
      embeddingModel.value = status.model;
      embeddingConfigured.value = status.configured;
      embeddingApiKeySource.value = status.apiKeySource;
    } catch {
      // sidecar 不可用时静默降级
    }
  }

  async function saveEmbeddingConfig(): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("neo.embeddingBaseUrl", embeddingBaseUrl.value);
    }
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (isTauri && embeddingProvider.value === "none") {
      await invoke("delete_embedding_api_key");
    } else if (isTauri && embeddingApiKey.value) {
      await invoke("set_embedding_api_key", { apiKey: embeddingApiKey.value });
    }
    await api.knowledgeSetEmbeddingConfig({
      provider: embeddingProvider.value,
      baseUrl: embeddingBaseUrl.value || undefined,
      apiKey: embeddingProvider.value === "none" ? null : (embeddingApiKey.value || undefined),
      model: embeddingModel.value || undefined,
      apiKeySource: embeddingProvider.value === "none"
        ? "none"
        : isTauri && (embeddingApiKey.value || embeddingApiKeySource.value === "keychain") ? "keychain" : undefined
    });
    if (embeddingApiKeySource.value === "legacy") {
      await api.knowledgeClearLegacyEmbeddingSecret();
    }
    embeddingApiKey.value = ""; // 清空内存中的明文 key
    await loadEmbeddingConfig();
  }

  async function reindexAll(): Promise<void> {
    await api.knowledgeReindex(embeddingModel.value || undefined);
  }

  async function loadKnowledgeRootPath(): Promise<void> {
    const result = await api.knowledgeGetRootPath();
    knowledgeRootPath.value = result.path;
  }

  async function setKnowledgeRootPath(path: string): Promise<void> {
    const trimmed = path.trim();
    const result = await api.knowledgeSetRootPath(trimmed);
    knowledgeRootPath.value = result.path;
  }

  async function exportKnowledgeMirror(): Promise<void> {
    knowledgeMirrorBusy.value = true;
    knowledgeMirrorError.value = false;
    try {
      const result = await api.knowledgeMirrorExport();
      knowledgeMirrorMessage.value = `已导出 ${result.projects} 个项目、${result.notes} 篇笔记、${result.tasks} 个任务`;
    } catch (error) {
      knowledgeMirrorError.value = true;
      knowledgeMirrorMessage.value = error instanceof Error ? error.message : "导出失败";
    } finally {
      knowledgeMirrorBusy.value = false;
    }
  }

  async function importKnowledgeMirror(): Promise<void> {
    knowledgeMirrorBusy.value = true;
    knowledgeMirrorError.value = false;
    try {
      const result = await api.knowledgeMirrorImport();
      knowledgeMirrorMessage.value = `已导入 ${result.importedProjects} 个项目、${result.importedNotes} 篇笔记；重建 ${result.reindexedNotes} 篇笔记索引`;
    } catch (error) {
      knowledgeMirrorError.value = true;
      knowledgeMirrorMessage.value = error instanceof Error ? error.message : "导入失败";
    } finally {
      knowledgeMirrorBusy.value = false;
    }
  }

  function setSection(id: SettingsSection): void {
    activeSection.value = id;
  }

  function selectModel(key: ModelKey): void {
    selectedModel.value = key;
  }

  function selectMount(mode: MountMode): void {
    mountMode.value = mode;
  }

  function removeBlacklistItem(name: string): void {
    blacklist.value = blacklist.value.filter((item) => item !== name);
  }

  function addBlacklistItem(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || blacklist.value.includes(trimmed)) return;
    blacklist.value = [...blacklist.value, trimmed];
  }

  return {
    // state
    activeSection,
    language,
    autoStart,
    minimizeToTray,
    mountMode,
    assistantTheme,
    assistantSize,
    ttsEnabled,
    wallpaperStatusEnabled,
    wallpaperAmbientTint,
    immersiveMode,
    focusAutoImmersive,
    personaLoaded,
    toneStyle,
    nudgeFrequency,
    selectedModel,
    apiKeyMasked,
    customApiEndpoint,
    ttsEngine,
    windowDetection,
    appEventLogging,
    screenContentCapture,
    blacklist,
    hookApiEnabled,
    hookPort,
    hookSentinelActive,
    autoScanInject,
    floatingApproval,
    mqttEnabled,
    embeddingProvider,
    embeddingModel,
    embeddingBaseUrl,
    embeddingApiKey,
    embeddingConfigured,
    embeddingApiKeySource,
    searchScope,
    chunkSize,
    indexAutoRebuild,
    knowledgeRootPath,
    knowledgeMirrorBusy,
    knowledgeMirrorMessage,
    knowledgeMirrorError,
    // actions
    setSection,
    selectModel,
    selectMount,
    removeBlacklistItem,
    addBlacklistItem,
    reindexAll,
    setKnowledgeRootPath,
    loadKnowledgeRootPath,
    exportKnowledgeMirror,
    importKnowledgeMirror,
    loadEmbeddingConfig,
    saveEmbeddingConfig,
  };
}

export type SettingsState = ReturnType<typeof useSettings>;

export const SECTION_TITLES: Record<SettingsSection, string> = {
  general: "通用设置",
  assistant: "助手形象",
  persona: "人设配置",
  model: "模型配置",
  privacy: "隐私安全",
  knowledge: "知识库",
  hooks: "Hook 与连接",
};
