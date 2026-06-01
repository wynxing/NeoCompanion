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
