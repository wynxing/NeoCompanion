import { ref } from "vue";

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

const KNOWLEDGE_ROOT_PATH_KEY = "neo:knowledgeRootPath";

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
  const searchScope = ref<SearchScope>("current");
  const chunkSize = ref("1200");
  const indexAutoRebuild = ref(true);
  // 知识库根目录：阶段 0 仅记录路径并持久化到 localStorage，数据仍为 mock；
  // v2 文件化存储接入后由 sidecar 读取此路径作为笔记/索引落盘根目录。
  const knowledgeRootPath = ref<string>(
    typeof localStorage !== "undefined" ? localStorage.getItem(KNOWLEDGE_ROOT_PATH_KEY) ?? "" : "",
  );

  function reindexAll(): void {
    // mock：v2 接入后会调用 api.reindexKnowledge()
  }

  function setKnowledgeRootPath(path: string): void {
    const trimmed = path.trim();
    knowledgeRootPath.value = trimmed;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KNOWLEDGE_ROOT_PATH_KEY, trimmed);
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
    searchScope,
    chunkSize,
    indexAutoRebuild,
    knowledgeRootPath,
    // actions
    setSection,
    selectModel,
    selectMount,
    removeBlacklistItem,
    addBlacklistItem,
    reindexAll,
    setKnowledgeRootPath,
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
