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

export function useSettings() {
  const isDark = ref(false);
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
  const apiKeyMasked = ref("sk-••••••••3f7a");
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
  const openClawDetected = ref(false);

  function toggleTheme(): void {
    isDark.value = !isDark.value;
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
    isDark,
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
    openClawDetected,
    // actions
    toggleTheme,
    setSection,
    selectModel,
    selectMount,
    removeBlacklistItem,
    addBlacklistItem,
  };
}

export type SettingsState = ReturnType<typeof useSettings>;

export const SECTION_TITLES: Record<SettingsSection, string> = {
  general: "通用设置",
  assistant: "助手形象",
  persona: "人设配置",
  model: "模型配置",
  privacy: "隐私安全",
  hooks: "Hook 与连接",
};
