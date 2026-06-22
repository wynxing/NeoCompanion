import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { streamDeepSeekChat, embedContents } from "@neo-companion/ai";
import { createAiConversationStore, createDatabase, createHookRulesStore, createKnowledgeStore, getAppConfig, setAppConfig, type AiConversationStore, type KnowledgeStore, type NeoDatabase } from "@neo-companion/db";
import type { ChatMessage, CompanionFeedback, TtsResult } from "@neo-companion/shared";
import { speakWithMimo } from "@neo-companion/tts";
import { createFocusManager } from "./services/focus-manager";
import { createHookManager, type HookManagerEvents } from "./services/hook-manager";
import { getWeatherSummary } from "./services/weather-service";
import { getActiveWindowSnapshot } from "./services/window-service";
import { registerKnowledgeRoutes } from "./modules/knowledge/routes";
import { createKnowledgeService, type EmbeddingConfig, type KnowledgeService } from "./modules/knowledge/service";
import { createAiService, type AiService } from "./modules/ai/service";
import { WsHub } from "./ws-hub";
import { registerHealthRoutes } from "./routes/health";
import { registerTaskRoutes } from "./routes/tasks";
import { registerFocusRoutes } from "./routes/focus";
import { registerWeatherRoutes } from "./routes/weather";
import { registerAiRoutes } from "./routes/ai";
import { registerTtsRoutes } from "./routes/tts";
import { registerWindowRoutes } from "./routes/window";
import { registerHookRoutes } from "./routes/hooks";
import { registerWsRoutes } from "./routes/ws";

export interface AppDependencies {
  database?: NeoDatabase;
  aiStream?: (messages: ChatMessage[]) => AsyncIterable<string>;
  ttsSpeak?: (text: string, style?: string) => Promise<TtsResult>;
  weather?: () => Promise<unknown>;
  windowSnapshot?: typeof getActiveWindowSnapshot;
  startBackground?: boolean;
  hookManager?: ReturnType<typeof createHookManager>;
  /** Shared bearer token. Tests inject this; production reads APP_AUTH_TOKEN. */
  authToken?: string;
}

export async function createApp(dependencies: AppDependencies = {}) {
  const authToken = dependencies.authToken ?? process.env.APP_AUTH_TOKEN;
  if (!authToken) throw new Error("APP_AUTH_TOKEN is required");
  const database = dependencies.database ?? createDatabase();
  // Knowledge store requires the sqlite path; null when only the memory
  // fallback is reachable (better-sqlite3 native binding unavailable). Routes
  // degrade to 503 in that case.
  const knowledgeStore: KnowledgeStore | null = database.kind === "sqlite" ? createKnowledgeStore(database) : null;
  // Embedding provider config persisted to the app_config table so it survives
  // sidecar restarts (apiKey lives only in the local db file, never in git).
  // Falls back to an in-memory variable on the memory database.
  const EMBEDDING_CONFIG_KEY = "embedding";
  const parseConfig = (raw: string | null): EmbeddingConfig => {
    if (!raw) return { provider: "none" };
    try {
      const parsed = JSON.parse(raw) as EmbeddingConfig;
      return parsed && typeof parsed === "object" ? parsed : { provider: "none" };
    } catch {
      return { provider: "none" };
    }
  };
  const loadedEmbeddingConfig = database.kind === "sqlite" ? parseConfig(getAppConfig(database, EMBEDDING_CONFIG_KEY)) : { provider: "none" };
  let legacyEmbeddingApiKey = loadedEmbeddingConfig.apiKey;
  let runtimeEmbeddingApiKey: string | undefined;
  let embeddingConfig: EmbeddingConfig = { ...loadedEmbeddingConfig, apiKey: undefined };
  const persistEmbeddingConfig = () => {
    if (database.kind !== "sqlite") return;
    const persisted = { ...embeddingConfig, apiKey: legacyEmbeddingApiKey };
    if (!legacyEmbeddingApiKey) delete persisted.apiKey;
    setAppConfig(database, EMBEDDING_CONFIG_KEY, JSON.stringify(persisted));
  };
  const embeddingConfigController = {
    get: () => ({ ...embeddingConfig, apiKey: runtimeEmbeddingApiKey ?? legacyEmbeddingApiKey }),
    set: (next: EmbeddingConfig) => {
      runtimeEmbeddingApiKey = next.apiKey;
      embeddingConfig = { ...next, apiKey: undefined };
      persistEmbeddingConfig();
    },
    getLegacySecret: () => legacyEmbeddingApiKey,
    clearLegacySecret: () => {
      legacyEmbeddingApiKey = undefined;
      persistEmbeddingConfig();
    }
  };
  const knowledgeService: KnowledgeService | null = knowledgeStore
    ? createKnowledgeService(knowledgeStore, {
        embedFn: embedContents,
        getEmbeddingConfig: embeddingConfigController.get
      })
    : null;
  void knowledgeService?.drainEmbeddings();
  const hub = new WsHub();
  const app = Fastify({ logger: true });
  const aiStream = dependencies.aiStream ?? ((messages) => streamDeepSeekChat(messages));
  const aiConversationStore: AiConversationStore | null = database.kind === "sqlite" ? createAiConversationStore(database) : null;
  const aiService = createAiService({
    conversationStore: aiConversationStore,
    knowledgeService,
    knowledgeStore,
    aiStream,
    hub
  });
  const ttsSpeak = dependencies.ttsSpeak ?? ((text, style) => speakWithMimo(text, style));
  const windowSnapshot = dependencies.windowSnapshot ?? getActiveWindowSnapshot;

  const allowedOrigins = new Set([
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://127.0.0.1:5173",
    ...(process.env.NEO_ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim()).filter(Boolean)
  ]);
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(null, false);
    }
  });
  await app.register(websocket);

  const tokenMatches = (candidate: string | undefined): boolean => {
    if (!candidate) return false;
    const expected = Buffer.from(authToken);
    const actual = Buffer.from(candidate);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  };
  const ROOT_PATH_KEY = "knowledge.rootPath";
  let knowledgeRootPath = database.kind === "sqlite" ? (getAppConfig(database, ROOT_PATH_KEY) ?? "") : "";
  const rootPathController = {
    get: () => knowledgeRootPath,
    set: (path: string) => {
      knowledgeRootPath = path;
      if (database.kind === "sqlite") setAppConfig(database, ROOT_PATH_KEY, path);
    }
  };

  app.addHook("onRequest", async (request, reply) => {
    const rawHost = request.headers.host ?? "";
    const host = rawHost.startsWith("[") ? rawHost.slice(1, rawHost.indexOf("]")) : rawHost.split(":")[0];
    if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) {
      return reply.code(403).send({ error: "host not allowed" });
    }
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      return reply.code(403).send({ error: "origin not allowed" });
    }
    if (request.method === "OPTIONS") return;
    const bearer = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const protocols = String(request.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((value) => value.trim());
    const wsToken = protocols.find((value) => value.startsWith("auth."))?.slice(5);
    if (!tokenMatches(bearer) && !tokenMatches(wsToken)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

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
  const hookManager = dependencies.hookManager ?? createHookManager(hookEvents, createHookRulesStore(database));

  // ── Route Registration ──
  registerHealthRoutes(app);
  registerTaskRoutes(app, database, hub);
  registerKnowledgeRoutes(app, knowledgeStore, knowledgeService, embeddingConfigController, rootPathController);
  registerFocusRoutes(app, focus, hub);
  registerWeatherRoutes(app, dependencies.weather);
  registerAiRoutes(app, aiService);
  registerTtsRoutes(app, hub, ttsSpeak);
  registerWindowRoutes(app, { database, hub, snapshot: windowSnapshot });
  registerHookRoutes(app, hookManager);
  registerWsRoutes(app, hub, hookManager);

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
