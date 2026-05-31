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

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
export const LEGACY_DEEPSEEK_MODELS = new Set(["deepseek-chat", "deepseek-reasoner"]);
