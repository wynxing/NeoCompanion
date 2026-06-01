import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { streamDeepSeekChat } from "@neo-companion/ai";
import { createDatabase, createTaskStore, createWindowEventStore, type NeoDatabase } from "@neo-companion/db";
import type { ChatMessage, CompanionFeedback, TtsResult } from "@neo-companion/shared";
import { speakWithMimo } from "@neo-companion/tts";
import { createFocusManager } from "./services/focus-manager";
import { createHookManager, type HookManagerEvents } from "./services/hook-manager";
import { getWeatherSummary } from "./services/weather-service";
import { getActiveWindowSnapshot } from "./services/window-service";
import { WsHub } from "./ws-hub";

export interface AppDependencies {
  database?: NeoDatabase;
  aiStream?: (messages: ChatMessage[]) => AsyncIterable<string>;
  ttsSpeak?: (text: string, style?: string) => Promise<TtsResult>;
  weather?: () => Promise<unknown>;
  windowSnapshot?: typeof getActiveWindowSnapshot;
  startBackground?: boolean;
  hookManager?: ReturnType<typeof createHookManager>;
}

export async function createApp(dependencies: AppDependencies = {}) {
  const database = dependencies.database ?? createDatabase();
  const taskStore = createTaskStore(database);
  const windowStore = createWindowEventStore(database);
  const hub = new WsHub();
  const app = Fastify({ logger: true });
  const aiStream = dependencies.aiStream ?? ((messages) => streamDeepSeekChat(messages));
  const ttsSpeak = dependencies.ttsSpeak ?? ((text, style) => speakWithMimo(text, style));
  const windowSnapshot = dependencies.windowSnapshot ?? getActiveWindowSnapshot;

  await app.register(cors, { origin: true });
  await app.register(websocket);

  const focus = createFocusManager(database, {
    onTick(payload) {
      hub.broadcast({ type: "focus:tick", payload });
    },
    onComplete(session) {
      const feedback: CompanionFeedback = {
        state: "happy",
        text: "这轮专注完成啦，先放松一下眼睛。",
        speak: true
      };
      hub.broadcast({ type: "companion:feedback", payload: feedback });
      hub.broadcast({ type: "task:statusChanged", payload: session });
      void ttsSpeak(feedback.text, "温柔、轻快、像陪伴学习的朋友").then((result) => {
        hub.broadcast({ type: "tts:done", payload: result });
      }).catch((error: unknown) => {
        app.log.warn({ error }, "TTS feedback failed");
      });
    }
  });

  const hookEvents: HookManagerEvents = {
    onStatusChanged(payload) {
      hub.broadcast({ type: "hook:statusChanged", payload });
    },
    onPermissionRequest(payload) {
      hub.broadcast({ type: "permission:request", payload });
    },
    onPermissionResolved(payload) {
      hub.broadcast({ type: "permission:resolved", payload });
    },
    onPermissionAutoDismiss(payload) {
      hub.broadcast({ type: "permission:autoDismiss", payload });
    },
  };
  const hookManager = dependencies.hookManager ?? createHookManager(hookEvents);

  app.get("/health", async () => ({
    ok: true,
    service: "neo-companion-server-local",
    time: new Date().toISOString()
  }));

  app.get("/api/tasks", async () => taskStore.list());
  app.post("/api/tasks", async (request, reply) => {
    const body = request.body as { title?: string };
    if (!body.title?.trim()) return reply.code(400).send({ error: "title is required" });
    const task = taskStore.create(body.title);
    hub.broadcast({ type: "task:statusChanged", payload: task });
    return task;
  });
  app.patch("/api/tasks/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const task = taskStore.patch(params.id, request.body as { title?: string; status?: "open" | "done" });
    if (!task) return reply.code(404).send({ error: "task not found" });
    hub.broadcast({ type: "task:statusChanged", payload: task });
    return task;
  });

  app.post("/api/focus/start", async (request) => {
    const body = request.body as { taskId?: string | null; durationMinutes?: number };
    const session = focus.start(body.taskId ?? null, body.durationMinutes ?? 25);
    hub.broadcast({
      type: "companion:feedback",
      payload: { state: "focus", text: "我们开始这一轮专注吧，我会安静陪着你。", speak: true } satisfies CompanionFeedback
    });
    return session;
  });
  app.post("/api/focus/:id/complete", async (request, reply) => {
    const params = request.params as { id: string };
    const session = focus.complete(params.id);
    if (!session) return reply.code(404).send({ error: "focus session not found" });
    return session;
  });

  app.get("/api/weather", async () => dependencies.weather?.() ?? getWeatherSummary());

  app.post("/api/ai/chat", async (request, reply) => {
    const body = request.body as { message?: string };
    if (!body.message?.trim()) return reply.code(400).send({ error: "message is required" });

    const messages: ChatMessage[] = [
      { role: "system", content: "你是 NeoCompanion 的中文温柔陪伴助手，回答简洁、具体，不使用强主宠称呼。" },
      { role: "user", content: body.message }
    ];
    let text = "";

    try {
      hub.broadcast({ type: "companion:feedback", payload: { state: "thinking", text: "我想一想。", speak: false } satisfies CompanionFeedback });
      for await (const chunk of aiStream(messages)) {
        text += chunk;
        hub.broadcast({ type: "ai:chunk", payload: { chunk } });
      }
      hub.broadcast({ type: "ai:done", payload: { text } });
      return { text };
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed";
      hub.broadcast({ type: "ai:error", payload: { message } });
      return reply.code(500).send({ error: message });
    }
  });

  app.post("/api/tts/speak", async (request, reply) => {
    const body = request.body as { text?: string; style?: string };
    if (!body.text?.trim()) return reply.code(400).send({ error: "text is required" });

    hub.broadcast({ type: "tts:started", payload: { text: body.text } });
    const result = await ttsSpeak(body.text, body.style ?? "温柔、自然");
    hub.broadcast({ type: "tts:done", payload: result });
    return result;
  });

  app.get("/api/window/active", async () => {
    const snapshot = await windowSnapshot();
    windowStore.create(snapshot);
    hub.broadcast({ type: "window:activeChanged", payload: snapshot });
    if (snapshot.classification === "distracted") {
      hub.broadcast({
        type: "companion:feedback",
        payload: { state: "warn", text: "好像有点偏离啦，要不要先回到刚才的任务？", speak: true } satisfies CompanionFeedback
      });
    }
    return snapshot;
  });

  // ── Hook System Routes ──

  app.post("/api/hook/push", async (request, reply) => {
    const body = request.body as { agentId?: string; type?: string; state?: string; description?: string; timestamp?: number };
    if (!body.agentId?.trim()) return reply.code(400).send({ error: "agentId is required" });
    if (body.type !== "status") return reply.code(400).send({ error: "type must be 'status'" });
    if (!body.state) return reply.code(400).send({ error: "state is required" });

    hookManager.pushEvent({
      agentId: body.agentId,
      type: "status",
      state: body.state as import("@neo-companion/shared").AgentState,
      description: body.description,
      timestamp: body.timestamp ?? Date.now(),
    });
    return reply.code(204).send();
  });

  app.post("/api/hook/permission", async (request, reply) => {
    const body = request.body as { agentId?: string; command?: string; severity?: number; description?: string };
    if (!body.agentId?.trim()) return reply.code(400).send({ error: "agentId is required" });
    if (!body.command?.trim()) return reply.code(400).send({ error: "command is required" });
    if (typeof body.severity !== "number") return reply.code(400).send({ error: "severity is required" });

    try {
      const response = await hookManager.requestPermission({
        agentId: body.agentId,
        command: body.command,
        severity: body.severity,
        description: body.description,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "permission request failed";
      if (message === "stale" || message === "agentStateChanged") {
        return reply.code(410).send({ error: "request stale" });
      }
      if (message === "shutdown") {
        return reply.code(503).send({ error: "server shutting down" });
      }
      return reply.code(500).send({ error: message });
    }
  });

  app.get("/api/hook/always-rules", async () => hookManager.getAlwaysRules());

  app.delete("/api/hook/always-rules", async (request, reply) => {
    const body = request.body as { agentId?: string; commandPrefix?: string };
    if (!body.agentId?.trim()) return reply.code(400).send({ error: "agentId is required" });
    if (!body.commandPrefix?.trim()) return reply.code(400).send({ error: "commandPrefix is required" });
    hookManager.removeAlwaysRule(body.agentId, body.commandPrefix);
    return reply.code(204).send();
  });

  app.get("/ws", { websocket: true }, (socket) => {
    hub.add(socket);
    socket.on("message", (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; payload?: Record<string, unknown> };
        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", payload: {} }));
        }
        if (message.type === "permission:response") {
          const payload = message.payload as { requestId?: string; decision?: string };
          if (payload.requestId && payload.decision) {
            hookManager.resolvePermission(
              payload.requestId,
              payload.decision as import("@neo-companion/shared").PermissionDecision,
            );
          }
        }
      } catch {
        socket.send(JSON.stringify({ type: "ai:error", payload: { message: "Invalid WS message" } }));
      }
    });
  });

  let windowTimer: NodeJS.Timeout | null = null;
  if (dependencies.startBackground ?? true) {
    windowTimer = setInterval(() => {
      void app.inject({ method: "GET", url: "/api/window/active" }).catch((error) => app.log.debug({ error }, "window poll failed"));
    }, 30000);
  }

  app.addHook("onClose", async () => {
    hookManager.close();
    focus.close();
    if (windowTimer) clearInterval(windowTimer);
    database.close();
  });

  return app;
}

export type NeoCompanionApp = FastifyInstance;
