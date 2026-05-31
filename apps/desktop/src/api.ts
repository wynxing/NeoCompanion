import type { ChatMessage, FocusSession, Task, TtsResult, WeatherSummary, WsMessage } from "@neo-companion/shared";

export const API_BASE = import.meta.env.VITE_NEO_SERVER_URL ?? "http://127.0.0.1:10103";
export const WS_BASE = API_BASE.replace(/^http/, "ws");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? response.statusText);
  }

  return response.json() as Promise<T>;
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
  speak: (text: string, style?: string) =>
    request<TtsResult>("/api/tts/speak", { method: "POST", body: JSON.stringify({ text, style }) })
};

export function connectWs(onMessage: (message: WsMessage) => void) {
  const ws = new WebSocket(`${WS_BASE}/ws`);
  ws.addEventListener("message", (event) => {
    onMessage(JSON.parse(event.data) as WsMessage);
  });
  const heartbeat = window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
  }, 30000);

  return () => {
    window.clearInterval(heartbeat);
    ws.close();
  };
}

export type { ChatMessage };
