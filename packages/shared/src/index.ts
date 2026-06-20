export type CompanionState = "idle" | "focus" | "happy" | "thinking" | "warn" | "sleepy";

export type TaskStatus = "open" | "done";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number;
}

export interface WeatherSummary {
  city: string;
  temperatureC: number | null;
  precipitationChance: number | null;
  text: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WindowSnapshot {
  title: string;
  processName: string;
  capturedAt: string;
  dwellSeconds: number;
  classification: "focused" | "distracted" | "stuck";
}

export interface CompanionFeedback {
  state: CompanionState;
  text: string;
  speak?: boolean;
}

export interface WsMessage<TPayload = unknown> {
  type:
    | "ai:chunk"
    | "ai:done"
    | "ai:error"
    | "companion:feedback"
    | "task:statusChanged"
    | "focus:tick"
    | "window:activeChanged"
    | "tts:started"
    | "tts:done"
    | "hook:statusChanged"
    | "permission:request"
    | "permission:resolved"
    | "permission:autoDismiss"
    | "permission:response"
    | "pong";
  payload: TPayload;
  id?: string;
  replyTo?: string;
}

export interface FocusTickPayload {
  sessionId: string;
  elapsedSeconds: number;
  remainingSeconds: number;
}

export interface TtsResult {
  audioUrl: string | null;
  format: "mp3" | "wav";
  provider: "mimo";
  cached: boolean;
}

// ── Hook System Types ──

export type AgentState =
  | "idle"
  | "thinking"
  | "working"
  | "building"
  | "waiting"
  | "success"
  | "error"
  | "juggling"
  | "sleeping";

export interface HookEvent {
  agentId: string;
  type: "status";
  state: AgentState;
  description?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PermissionRequest {
  requestId: string;
  agentId: string;
  command: string;
  severity: number;
  description?: string;
  timestamp: number;
}

export type PermissionDecision = "allow" | "deny" | "always";

export interface PermissionResponse {
  requestId: string;
  decision: PermissionDecision;
}

export interface AlwaysRule {
  agentId: string;
  commandPrefix: string;
  createdAt: number;
}

export type PermissionStatus = "pending" | "active" | "stale";

export interface QueuedPermission extends PermissionRequest {
  status: PermissionStatus;
}

export interface HookStatusChangedPayload {
  agentId: string;
  state: AgentState;
  description?: string;
}

export interface PermissionRequestPayload extends PermissionRequest {}

export interface PermissionResolvedPayload {
  requestId: string;
  decision: PermissionDecision;
}

export interface PermissionAutoDismissPayload {
  requestId: string;
  reason: "agentStateChanged" | "staleTimeout";
}

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const LEGACY_DEEPSEEK_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);

// ── Knowledge Workspace (v2) ──
// These types match the frontend mock contract (useKnowledgeMock.ts), which is
// the de-facto UI contract: epoch-ms timestamps, BoardColumn scoped directly to
// a project (no boards layer — YAGNI for the current UI), optional color/icon.
// Note: the v1 pet-panel task feature keeps its own `open|done` TaskStatus above;
// knowledge kanban tasks use a separate 4-state status and table. Unifying the
// two is tracked in docs/TODO_INVENTORY.md.

export interface KnowledgeProject {
  id: string;
  title: string;
  description?: string;
  parentId: string | null;
  color?: string;
  icon?: string;
  isInbox?: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeNote {
  id: string;
  projectId: string;
  title: string;
  /** Markdown 全文（SSOT）。列表显示请用 excerpt 派生。 */
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type KnowledgeTaskStatus = "todo" | "doing" | "done" | "archived";

/** 看板列，直接归属项目（当前 UI 不暴露多看板层）。 */
export interface KnowledgeBoardColumn {
  id: string;
  projectId: string;
  title: string;
  status: KnowledgeTaskStatus;
  order: number;
}

export interface KnowledgeTask {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description?: string;
  status: KnowledgeTaskStatus;
  order: number;
  linkedNoteId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** A retrieval hit used as a citable source in AI answers. */
export interface KnowledgeSource {
  sourceType: "note" | "task";
  sourceId: string;
  projectId: string;
  title: string;
  excerpt: string;
  chunkId: string;
}

/** Rich index status returned by the API; the UI maps it to KnowledgeIndexState. */
export type IndexMode = "hybrid" | "fts-only";

export interface IndexStatus {
  mode: IndexMode;
  pending: number;
  failed: number;
  stale: number;
  providerConfigured: boolean;
  vectorExtensionAvailable: boolean;
}

/** Simplified UI state consumed by IndexStatusDot. */
export type KnowledgeIndexState = "ok" | "fts_only" | "indexing";

/** open-notebook RAG移植：AI 对话的两种检索模式。 */
export type AiRetrievalMode = "chat" | "ask";

/** open-notebook 移植：每条笔记/任务进入 AI 上下文的三级权限。 */
export type ContextLevel = "full" | "summary" | "excluded";

/** AI 对话统一响应：文本 + 服务端生成的可引用来源 + 实际检索模式。 */
export interface AiAnswer {
  text: string;
  sources: KnowledgeSource[];
  retrievalMode: AiRetrievalMode;
}

export type KnowledgeChunkIndexStatus = "pending" | "indexed" | "failed" | "stale";
