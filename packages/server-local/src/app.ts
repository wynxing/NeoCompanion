import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { type FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { streamDeepSeekChat, embedContents } from "@neo-companion/ai";
import { createAiConversationStore, createDatabase, createHookRulesStore, createKnowledgeStore, getAppConfig, setAppConfig, type AiConversationStore, type KnowledgeStore, type NeoDatabase } from "@neo-companion/db";
import type { ChatMessage, CompanionFeedback, TtsResult } from "@neo-companion/shared";
import { speakWithMimo } from "@neo-companion/tts";
import { isHttpError } from "./errors";
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
  // fallback is reachable (for example, when the database cannot be opened). Routes
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
    // 持久化的 JSON 永远不含 apiKey：新 key 仅存 keychain/env（runtime 内存），
    // legacy 明文 key 仅保留在内存供本会话迁移，不再写回磁盘。这样每次 set()
    // 都会用干净的配置覆盖旧行，存量用户的明文 key 在下次保存时自动消失。
    const persisted = { ...embeddingConfig };
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
  const app = Fastify({
    logger: true,
    // Default body limit: 1MB. Knowledge mirror import endpoints may need more
    // but currently they only accept { path } so 1MB is plenty.
    bodyLimit: 1_048_576
  }).withTypeProvider<TypeBoxTypeProvider>();
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
  // Helmet: sidecar serves JSON APIs (no HTML), so disable CSP.
  // HSTS disabled because the sidecar is HTTP on localhost.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: false,
  });
  // Rate limit: guard against request storms from frontend bugs.
  // Sidecar is single-user on localhost, so default IP key is sufficient.
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
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
        const message = error instanceof Error ? error.message : "TTS feedback failed";
        hub.broadcast({ type: "tts:error", payload: { message, text: feedback.text } });
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

  // ── Global Error Handler ──
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { validation?: unknown };
    // Our typed business errors: return consistent shape
    if (isHttpError(err)) {
      reply.code(err.statusCode).send({
        error: err.message,
        code: err.code
      });
      return;
    }
    // Fastify validation errors (400 from schema checks)
    if (err.validation) {
      reply.code(400).send({
        error: "validation failed",
        code: "VALIDATION_ERROR",
        details: err.validation
      });
      return;
    }
    // Status code set by the route via reply.code() before throwing
    const status = reply.statusCode >= 400 ? reply.statusCode : 500;
    const message = status === 500 ? "internal server error" : err.message;
    if (status === 500) app.log.error(err, "unhandled error");
    reply.code(status).send({ error: message });
  });

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
    hub.close();
    hookManager.close();
    focus.close();
    if (windowTimer) clearInterval(windowTimer);
    database.close();
  });

  return app;
}

export type NeoCompanionApp = FastifyInstance;
