import type {
  AiAnswer,
  AiRetrievalMode,
  ChatMessage,
  ContextLevel,
  FocusSession,
  IndexStatus,
  KnowledgeSource,
  Task,
  TtsResult,
  WeatherSummary,
  WsMessage
} from "@neo-companion/shared";
import type { BoardColumn, KnowledgeNote, KnowledgeProject, KnowledgeTask, TaskStatus } from "./composables/useKnowledgeMock";
import { invoke } from "@tauri-apps/api/core";

export interface EmbeddingConfigInput {
  provider?: string;
  baseUrl?: string;
  apiKey?: string | null;
  model?: string;
  apiKeySource?: "keychain" | "env" | "legacy" | "none";
}
export interface EmbeddingConfigStatus {
  provider: string;
  baseUrl: string;
  model: string;
  configured: boolean;
  apiKeySource: "keychain" | "env" | "legacy" | "none";
  legacyMigrationRequired: boolean;
}
export interface AiChatRequest {
  message: string;
  mode?: AiRetrievalMode;
  projectId?: string | null;
  context?: { notes: Record<string, ContextLevel>; tasks: Record<string, ContextLevel> };
  conversationId?: string;
}

export const API_BASE = import.meta.env.VITE_NEO_SERVER_URL ?? "http://127.0.0.1:10103";
export const WS_BASE = API_BASE.replace(/^http/, "ws");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? response.statusText);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

let authTokenPromise: Promise<string> | null = null;
function getAuthToken(): Promise<string> {
  if (!authTokenPromise) {
    const envToken = import.meta.env.VITE_NEO_AUTH_TOKEN as string | undefined;
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    authTokenPromise = isTauri
      ? invoke<string>("get_app_auth_token")
      : envToken
        ? Promise.resolve(envToken)
        : Promise.reject(new Error("VITE_NEO_AUTH_TOKEN is required"));
  }
  return authTokenPromise;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  listTasks: () => request<Task[]>("/api/tasks"),
  createTask: (title: string) => request<Task>("/api/tasks", { method: "POST", body: JSON.stringify({ title }) }),
  patchTask: (id: string, patch: Partial<Pick<Task, "title" | "status">>) =>
    request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  startFocus: (taskId: string | null, durationMinutes = 25) =>
    request<FocusSession>("/api/focus/start", { method: "POST", body: JSON.stringify({ taskId, durationMinutes }) }),
  completeFocus: (id: string) => request<FocusSession>(`/api/focus/${id}/complete`, { method: "POST" }),
  weather: () => request<WeatherSummary>("/api/weather"),
  chat: (message: string) => request<{ text: string }>("/api/ai/chat", { method: "POST", body: JSON.stringify({ message }) }),
  aiChat: (req: AiChatRequest) =>
    request<AiAnswer>("/api/ai/chat", { method: "POST", body: JSON.stringify(req) }),
  speak: (text: string, style?: string) =>
    request<TtsResult>("/api/tts/speak", { method: "POST", body: JSON.stringify({ text, style }) }),

  // ── Knowledge workspace ──
  knowledgeListProjects: () => request<KnowledgeProject[]>("/api/knowledge/projects?root=1"),
  knowledgeChildProjects: (parentId: string) =>
    request<KnowledgeProject[]>(`/api/knowledge/projects?parentId=${encodeURIComponent(parentId)}`),
  knowledgeProjectPath: (id: string) =>
    request<KnowledgeProject[]>(`/api/knowledge/projects/${encodeURIComponent(id)}/path`),
  knowledgeCreateProject: (input: { title: string; parentId?: string | null; description?: string; color?: string; icon?: string }) =>
    request<KnowledgeProject>("/api/knowledge/projects", { method: "POST", body: JSON.stringify(input) }),
  knowledgeUpdateProject: (id: string, patch: Partial<Pick<KnowledgeProject, "title" | "description" | "color" | "icon" | "parentId" | "order">>) =>
    request<KnowledgeProject>(`/api/knowledge/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  knowledgeDeleteProject: (id: string) =>
    request<void>(`/api/knowledge/projects/${encodeURIComponent(id)}`, { method: "DELETE" }),
  knowledgeListNotes: (projectId: string) =>
    request<KnowledgeNote[]>(`/api/knowledge/projects/${encodeURIComponent(projectId)}/notes`),
  knowledgeCreateNote: (projectId: string, title: string) =>
    request<KnowledgeNote>(`/api/knowledge/projects/${encodeURIComponent(projectId)}/notes`, { method: "POST", body: JSON.stringify({ title }) }),
  knowledgeUpdateNote: (id: string, patch: Partial<Pick<KnowledgeNote, "title" | "body" | "tags">>) =>
    request<KnowledgeNote>(`/api/knowledge/notes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  knowledgeDeleteNote: (id: string) =>
    request<void>(`/api/knowledge/notes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  knowledgeBacklinks: (id: string) =>
    request<{ sourceType: "note" | "task"; sourceId: string }[]>(`/api/knowledge/notes/${encodeURIComponent(id)}/backlinks`),
  knowledgeListColumns: (projectId: string) =>
    request<BoardColumn[]>(`/api/knowledge/projects/${encodeURIComponent(projectId)}/columns`),
  knowledgeCreateColumn: (projectId: string, input: { title: string; status: TaskStatus; order: number }) =>
    request<BoardColumn>(`/api/knowledge/projects/${encodeURIComponent(projectId)}/columns`, { method: "POST", body: JSON.stringify(input) }),
  knowledgeUpdateColumn: (id: string, patch: Partial<Pick<BoardColumn, "title" | "status" | "order">>) =>
    request<BoardColumn>(`/api/knowledge/columns/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  knowledgeDeleteColumn: (id: string) =>
    request<void>(`/api/knowledge/columns/${encodeURIComponent(id)}`, { method: "DELETE" }),
  knowledgeListTasks: (projectId: string) =>
    request<KnowledgeTask[]>(`/api/knowledge/projects/${encodeURIComponent(projectId)}/tasks`),
  knowledgeCreateTask: (projectId: string, columnId: string, title: string) =>
    request<KnowledgeTask>(`/api/knowledge/projects/${encodeURIComponent(projectId)}/tasks`, { method: "POST", body: JSON.stringify({ columnId, title }) }),
  knowledgeUpdateTask: (id: string, patch: Partial<Pick<KnowledgeTask, "title" | "description" | "status" | "columnId" | "order">> & { linkedNoteId?: string | null }) =>
    request<KnowledgeTask>(`/api/knowledge/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),
  knowledgeDeleteTask: (id: string) =>
    request<void>(`/api/knowledge/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  knowledgeMoveTask: (id: string, columnId: string, index: number) =>
    request<void>(`/api/knowledge/tasks/${encodeURIComponent(id)}/move`, { method: "POST", body: JSON.stringify({ columnId, index }) }),
  knowledgeGetRootPath: () => request<{ path: string }>("/api/knowledge/root-path"),
  knowledgeSetRootPath: (path: string) =>
    request<{ path: string }>("/api/knowledge/root-path", { method: "PUT", body: JSON.stringify({ path }) }),
  knowledgeMirrorExport: (path?: string) =>
    request<{ projects: number; notes: number; columns: number; tasks: number }>("/api/knowledge/mirror/export", { method: "POST", body: JSON.stringify({ path }) }),
  knowledgeMirrorImport: (path?: string) =>
    request<{ importedProjects: number; importedNotes: number; importedColumns: number; importedTasks: number; skipped: number; reindexedNotes: number; reindexedTasks: number; errors: string[] }>("/api/knowledge/mirror/import", { method: "POST", body: JSON.stringify({ path }) }),

  // ── Knowledge retrieval + embedding config (Phase 3) ──
  knowledgeSearch: (query: string, projectId?: string | null, limit = 20) =>
    request<KnowledgeSource[]>(`/api/knowledge/search?q=${encodeURIComponent(query)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}&limit=${limit}`),
  knowledgeIndexStatus: () => request<IndexStatus>("/api/knowledge/index-status"),
  knowledgeReindex: (embeddingModel?: string) =>
    request<{ notes: number; tasks: number }>("/api/knowledge/reindex", { method: "POST", body: JSON.stringify({ embeddingModel }) }),
  knowledgeGetEmbeddingConfig: () =>
    request<EmbeddingConfigStatus>("/api/knowledge/embedding-config"),
  knowledgeSetEmbeddingConfig: (config: EmbeddingConfigInput) =>
    request<{ ok: boolean }>("/api/knowledge/embedding-config", { method: "PUT", body: JSON.stringify(config) }),
  knowledgeClaimLegacyEmbeddingSecret: () =>
    request<{ apiKey: string }>("/api/knowledge/embedding-config/legacy-secret/claim", { method: "POST" }),
  knowledgeClearLegacyEmbeddingSecret: () =>
    request<void>("/api/knowledge/embedding-config/legacy-secret", { method: "DELETE" })
};

/** Hydrate the sidecar's in-memory embedding secret from the OS keychain. */
export async function bootstrapEmbeddingSecret(): Promise<void> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!isTauri) return;
  const status = await api.knowledgeGetEmbeddingConfig();
  if (status.legacyMigrationRequired) {
    const legacy = await api.knowledgeClaimLegacyEmbeddingSecret();
    await invoke("set_embedding_api_key", { apiKey: legacy.apiKey });
    await api.knowledgeSetEmbeddingConfig({ apiKey: legacy.apiKey, apiKeySource: "keychain" });
    await api.knowledgeClearLegacyEmbeddingSecret();
    return;
  }
  const stored = await invoke<string | null>("get_embedding_api_key");
  if (stored) await api.knowledgeSetEmbeddingConfig({ apiKey: stored, apiKeySource: "keychain" });
}

let activeWs: WebSocket | null = null;

export function connectWs(onMessage: (message: WsMessage) => void) {
  let ws: WebSocket | null = null;
  let heartbeat: number | null = null;
  let cancelled = false;
  void getAuthToken().then((token) => {
    if (cancelled) return;
    ws = new WebSocket(`${WS_BASE}/ws`, ["neo-companion", `auth.${token}`]);
    activeWs = ws;
    ws.addEventListener("message", (event) => {
      onMessage(JSON.parse(event.data) as WsMessage);
    });
    heartbeat = window.setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 30000);
  }).catch((error: unknown) => {
    onMessage({ type: "ai:error", payload: { message: error instanceof Error ? error.message : "authentication failed" } });
  });

  return () => {
    cancelled = true;
    if (heartbeat !== null) window.clearInterval(heartbeat);
    activeWs = null;
    ws?.close();
  };
}

export function sendWsMessage(message: WsMessage) {
  if (activeWs?.readyState === WebSocket.OPEN) {
    activeWs.send(JSON.stringify(message));
  }
}

export type { ChatMessage };
