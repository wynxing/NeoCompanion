import { createDatabase, getAppConfig, setAppConfig, type NeoDatabase } from "@neo-companion/db";
import type { ChatMessage } from "@neo-companion/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";

let app: FastifyInstance;
let database: NeoDatabase;

beforeEach(async () => {
  database = createDatabase(":memory:");
  app = await createApp({
    authToken: "test-token",
    database,
    startBackground: false,
    aiStream: async function* (_messages: ChatMessage[]) {
      yield "你好，";
      yield "我在。";
    },
    ttsSpeak: async () => ({ audioUrl: "data:audio/mp3;base64,AA==", format: "mp3", provider: "mimo", cached: false }),
    weather: async () => ({ city: "Beijing", temperatureC: 20, precipitationChance: 0, text: "北京现在约 20°C。" })
  });
  const rawInject = app.inject.bind(app);
  app.inject = ((options: any) => rawInject(
    typeof options === "string" ? options : {
      ...options,
      headers: { authorization: "Bearer test-token", ...options.headers }
    }
  )) as typeof app.inject;
  await app.listen({ port: 0, host: "127.0.0.1" });
});

afterEach(async () => {
  await app.close();
});

describe("server app", () => {
  it("persists root path but never persists a new embedding secret", async () => {
    await app.inject({ method: "PUT", url: "/api/knowledge/root-path", payload: { path: "D:/notes" } });
    expect((await app.inject({ method: "GET", url: "/api/knowledge/root-path" })).json()).toEqual({ path: "D:/notes" });

    await app.inject({
      method: "PUT",
      url: "/api/knowledge/embedding-config",
      payload: { provider: "openai", model: "embed-model", apiKey: "secret-value", apiKeySource: "keychain" }
    });
    expect(getAppConfig(database, "embedding")).not.toContain("secret-value");
    const status = (await app.inject({ method: "GET", url: "/api/knowledge/embedding-config" })).json();
    expect(status.apiKeySource).toBe("keychain");
  });

  it("does not re-persist a legacy plaintext key when saving config", async () => {
    // Simulate an upgraded install where a plaintext embedding key was left in
    // app_config by an older sidecar version. createApp loads it into memory as
    // legacyEmbeddingApiKey; the fix ensures subsequent saves never write it back.
    const legacyDb = createDatabase(":memory:");
    setAppConfig(legacyDb, "embedding", JSON.stringify({
      provider: "openai",
      baseUrl: "https://api.openai.com",
      model: "text-embedding-3-small",
      apiKey: "legacy-plaintext-secret"
    }));
    expect(getAppConfig(legacyDb, "embedding")).toContain("legacy-plaintext-secret");

    const legacyApp = await createApp({
      authToken: "test-token",
      database: legacyDb,
      startBackground: false,
      aiStream: async function* () { yield "ok"; }
    });
    try {
      // Saving a config change (model swap) without providing an apiKey must
      // overwrite the stored row with a clean, key-less JSON.
      const res = await legacyApp.inject({
        method: "PUT",
        url: "/api/knowledge/embedding-config",
        headers: { authorization: "Bearer test-token" },
        payload: { model: "text-embedding-3-large" }
      });
      expect(res.statusCode).toBe(200);

      const stored = getAppConfig(legacyDb, "embedding");
      expect(stored).not.toContain("legacy-plaintext-secret");
      expect(stored).toContain("text-embedding-3-large");

      // The legacy key stays in memory so the frontend bootstrap can still
      // migrate it to the keychain this session.
      const status = (await legacyApp.inject({
        method: "GET",
        url: "/api/knowledge/embedding-config",
        headers: { authorization: "Bearer test-token" }
      })).json();
      expect(status.legacyMigrationRequired).toBe(true);
    } finally {
      await legacyApp.close();
    }
  });
  it("serves health and task CRUD", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "做 MVP" }
    });
    expect(created.statusCode).toBe(200);
    const task = created.json();
    expect(task.title).toBe("做 MVP");

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { status: "done" }
    });
    expect(patched.json().completedAt).toBeTruthy();
  });

  it("streams AI chunks through websocket and returns final text", async () => {
    const received: string[] = [];
    const address = app.server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, ["neo-companion", "auth.test-token"]);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    ws.on("message", (data: Buffer) => {
      const message = JSON.parse(data.toString()) as { type: string; payload: { chunk?: string } };
      if (message.type === "ai:chunk" && message.payload.chunk) {
        received.push(message.payload.chunk);
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/chat",
      payload: { message: "陪我专注" }
    });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(response.json().text).toBe("你好，我在。");
    expect(received.join("")).toBe("你好，我在。");
    ws.close();
  });

  it("returns weather and TTS mock responses", async () => {
    const weather = await app.inject({ method: "GET", url: "/api/weather" });
    expect(weather.json().city).toBe("Beijing");

    const tts = await app.inject({
      method: "POST",
      url: "/api/tts/speak",
      payload: { text: "休息一下。" }
    });
    expect(tts.json().provider).toBe("mimo");
  });
});
