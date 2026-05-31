import { createDatabase } from "@neo-companion/db";
import type { ChatMessage } from "@neo-companion/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";

let app: FastifyInstance;

beforeEach(async () => {
  app = await createApp({
    database: createDatabase(":memory:"),
    startBackground: false,
    aiStream: async function* (_messages: ChatMessage[]) {
      yield "你好，";
      yield "我在。";
    },
    ttsSpeak: async () => ({ audioUrl: "data:audio/mp3;base64,AA==", format: "mp3", provider: "mimo", cached: false }),
    weather: async () => ({ city: "Beijing", temperatureC: 20, precipitationChance: 0, text: "北京现在约 20°C。" })
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
});

afterEach(async () => {
  await app.close();
});

describe("server app", () => {
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
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
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
