import { ref, watch } from "vue";
import type {
  AiAnswer,
  AiRetrievalMode,
  ContextLevel,
  KnowledgeSource,
  WsMessage
} from "@neo-companion/shared";
import { api } from "../api";
import type { KnowledgeWorkspaceState } from "./useKnowledgeWorkspace";

/** UI-side chat message: assistant messages carry optional citable sources. */
export interface UiChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: KnowledgeSource[];
  streaming?: boolean;
  error?: boolean;
}

const CONTEXT_CYCLE: ContextLevel[] = ["full", "summary", "excluded"];
const CONTEXT_LABEL: Record<ContextLevel, string> = {
  full: "完整",
  summary: "摘要",
  excluded: "排除"
};

function nextId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Knowledge-scoped AI chat/ask composable.
 *
 * Transport: the request is HTTP POST `api.aiChat` (which resolves with the
 * final `AiAnswer` once streaming completes); WebSocket `ai:chunk` is used only
 * for live token display. The HTTP response is the authoritative source of the
 * final text/sources/conversationId; WS `ai:done`/`ai:error` act as fallbacks
 * if the HTTP response hasn't resolved. A `finalized` guard prevents the two
 * channels from double-finalizing the in-flight assistant message.
 */
export function useKnowledgeAi(workspace: KnowledgeWorkspaceState) {
  const aiMode = ref<AiRetrievalMode>("chat");
  const messages = ref<UiChatMessage[]>([]);
  const chatLoading = ref(false);
  const conversationId = ref<string | null>(null);
  /** key = noteId/taskId → ContextLevel. Defaults rebuilt per project. */
  const contextSelection = ref<Record<string, ContextLevel>>({});
  const contextLabel = CONTEXT_LABEL;

  // In-flight state (not reactive-relevant, kept as plain closures).
  let finalized = false;
  let pendingAssistantId: string | null = null;

  function rebuildContextDefaults(): void {
    const next: Record<string, ContextLevel> = {};
    for (const note of workspace.currentNotes.value) next[note.id] = "full";
    for (const task of workspace.currentTasks.value) next[task.id] = "full";
    contextSelection.value = next;
  }

  function resetThread(): void {
    messages.value = [];
    conversationId.value = null;
    chatLoading.value = false;
    finalized = false;
    pendingAssistantId = null;
  }

  // Project change → reset thread + rebuild context defaults for the new project.
  watch(
    () => workspace.currentProjectId.value,
    () => {
      resetThread();
      rebuildContextDefaults();
    }
  );

  // Mode switch → reset thread (Ask is one-shot; Chat restarts). Context kept.
  watch(aiMode, () => {
    resetThread();
  });

  function cycleContextLevel(id: string): void {
    const current = contextSelection.value[id] ?? "full";
    const idx = CONTEXT_CYCLE.indexOf(current);
    const nextLevel = CONTEXT_CYCLE[(idx + 1) % CONTEXT_CYCLE.length];
    contextSelection.value = { ...contextSelection.value, [id]: nextLevel };
  }

  /** Build the ChatContextSelection for the current project (excludes 'excluded'). */
  function buildContext(): { notes: Record<string, ContextLevel>; tasks: Record<string, ContextLevel> } {
    const notes: Record<string, ContextLevel> = {};
    const tasks: Record<string, ContextLevel> = {};
    const noteIds = new Set(workspace.currentNotes.value.map((n) => n.id));
    const taskIds = new Set(workspace.currentTasks.value.map((t) => t.id));
    for (const [id, level] of Object.entries(contextSelection.value)) {
      if (level === "excluded") continue;
      if (noteIds.has(id)) notes[id] = level;
      else if (taskIds.has(id)) tasks[id] = level;
    }
    return { notes, tasks };
  }

  function finalizeAssistant(id: string, answer: AiAnswer): void {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const updated = { ...messages.value[idx], text: answer.text, sources: answer.sources, streaming: false, error: false };
    messages.value = [...messages.value.slice(0, idx), updated, ...messages.value.slice(idx + 1)];
    if (answer.conversationId) conversationId.value = answer.conversationId;
  }

  function finalizeError(id: string, message: string): void {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx === -1) return;
    const updated = { ...messages.value[idx], text: message, streaming: false, error: true };
    messages.value = [...messages.value.slice(0, idx), updated, ...messages.value.slice(idx + 1)];
  }

  function appendToStreaming(chunk: string): void {
    if (!pendingAssistantId) return;
    const idx = messages.value.findIndex((m) => m.id === pendingAssistantId);
    if (idx === -1) return;
    const prev = messages.value[idx];
    const updated = { ...prev, text: prev.text + chunk };
    messages.value = [...messages.value.slice(0, idx), updated, ...messages.value.slice(idx + 1)];
  }

  function handleWsMessage(message: WsMessage): void {
    if (message.type === "ai:chunk") {
      const payload = message.payload as { chunk: string };
      appendToStreaming(payload.chunk);
      return;
    }
    if (message.type === "ai:done" && !finalized && pendingAssistantId) {
      finalized = true;
      chatLoading.value = false;
      finalizeAssistant(pendingAssistantId, message.payload as AiAnswer);
      pendingAssistantId = null;
      return;
    }
    if (message.type === "ai:error" && !finalized && pendingAssistantId) {
      finalized = true;
      chatLoading.value = false;
      const payload = message.payload as { message?: string };
      finalizeError(pendingAssistantId, payload.message ?? "AI 请求失败");
      pendingAssistantId = null;
    }
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || chatLoading.value) return;

    const projectId = workspace.currentProjectId.value;
    const userMsg: UiChatMessage = { id: nextId(), role: "user", text: trimmed };
    const assistantId = nextId();
    const assistantMsg: UiChatMessage = { id: assistantId, role: "assistant", text: "", streaming: true };
    messages.value = [...messages.value, userMsg, assistantMsg];

    chatLoading.value = true;
    finalized = false;
    pendingAssistantId = assistantId;

    const req: Parameters<typeof api.aiChat>[0] = { message: trimmed, mode: aiMode.value, projectId };
    if (aiMode.value === "chat") {
      req.context = buildContext();
      if (conversationId.value) req.conversationId = conversationId.value;
    }

    try {
      const answer = await api.aiChat(req);
      if (!finalized) {
        finalized = true;
        chatLoading.value = false;
        finalizeAssistant(assistantId, answer);
        pendingAssistantId = null;
      }
    } catch (error) {
      if (!finalized) {
        finalized = true;
        chatLoading.value = false;
        const msg = error instanceof Error ? error.message : "AI 请求失败";
        finalizeError(assistantId, msg);
        pendingAssistantId = null;
      }
    }
  }

  /** Navigate to a cited source, cross-project if needed. */
  function openSource(source: KnowledgeSource): void {
    if (chatLoading.value) return;
    if (source.projectId && source.projectId !== workspace.currentProjectId.value) {
      workspace.enterProject(source.projectId);
    }
    if (source.sourceType === "note") {
      workspace.selectTab("notes");
      workspace.selectNote(source.sourceId);
    } else {
      workspace.selectTab("tasks");
      workspace.selectTask(source.sourceId);
    }
  }

  return {
    aiMode,
    messages,
    chatLoading,
    conversationId,
    contextSelection,
    contextLabel,
    send,
    resetThread,
    cycleContextLevel,
    handleWsMessage,
    openSource
  };
}

export type KnowledgeAiState = ReturnType<typeof useKnowledgeAi>;

/** Helper for templates: strip [sN] citation markers from assistant text. */
export function stripCitations(text: string): string {
  return text.replace(/\[s\d+\]/g, "").trim();
}
