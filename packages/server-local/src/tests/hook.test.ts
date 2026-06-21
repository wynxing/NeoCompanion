import { createDatabase } from "@neo-companion/db";
import type { AgentState, HookStatusChangedPayload, PermissionRequestPayload } from "@neo-companion/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";
import { createApp } from "../app";

let app: FastifyInstance;
let baseUrl: string;

beforeEach(async () => {
  app = await createApp({
    authToken: "test-token",
    database: createDatabase(":memory:"),
    startBackground: false,
  });
  const rawInject = app.inject.bind(app);
  app.inject = ((options: any) => rawInject(
    typeof options === "string" ? options : {
      ...options,
      headers: { authorization: "Bearer test-token", ...options.headers }
    }
  )) as typeof app.inject;
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await app.close();
});

function connectTestWs(): Promise<{ ws: WebSocket; messages: unknown[]; close: () => void }> {
  return new Promise((resolve) => {
    const address = app.server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, ["neo-companion", "auth.test-token"]);
    const messages: unknown[] = [];
    ws.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()));
    });
    ws.once("open", () => resolve({ ws, messages, close: () => ws.close() }));
  });
}

function waitForMessage(
  messages: unknown[],
  type: string,
  timeoutMs = 500,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const existing = messages.find((m) => (m as { type: string }).type === type);
    if (existing) return resolve(existing);

    const start = Date.now();
    const interval = setInterval(() => {
      const found = messages.find((m) => (m as { type: string }).type === type);
      if (found) {
        clearInterval(interval);
        resolve(found);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for message type: ${type}`));
      }
    }, 20);
  });
}

describe("hook system", () => {
  describe("POST /api/hook/push", () => {
    it("returns 204 and broadcasts hook:statusChanged", async () => {
      const { messages, close } = await connectTestWs();

      const res = await app.inject({
        method: "POST",
        url: "/api/hook/push",
        payload: {
          agentId: "openclaw/main",
          type: "status",
          state: "working",
          description: "正在重构 app.ts",
        },
      });

      expect(res.statusCode).toBe(204);

      const msg = (await waitForMessage(messages, "hook:statusChanged")) as {
        payload: HookStatusChangedPayload;
      };
      expect(msg.payload.agentId).toBe("openclaw/main");
      expect(msg.payload.state).toBe("working");
      expect(msg.payload.description).toBe("正在重构 app.ts");

      close();
    });

    it("returns 400 for invalid payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/hook/push",
        payload: { type: "status", state: "working" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/hook/permission", () => {
    it("resolves with allow when resolved via WS", async () => {
      const { ws, messages, close } = await connectTestWs();

      // Start permission request (don't await - it hangs)
      const reqPromise = app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: {
          agentId: "test/main",
          command: "rm -rf node_modules",
          severity: 8,
        },
      });

      // Wait for permission:request broadcast
      const reqMsg = (await waitForMessage(messages, "permission:request")) as {
        payload: PermissionRequestPayload;
      };
      expect(reqMsg.payload.agentId).toBe("test/main");
      expect(reqMsg.payload.command).toBe("rm -rf node_modules");

      // Resolve via WS
      ws.send(
        JSON.stringify({
          type: "permission:response",
          payload: { requestId: reqMsg.payload.requestId, decision: "allow" },
        }),
      );

      const res = await reqPromise;
      expect(res.statusCode).toBe(200);
      expect(res.json().decision).toBe("allow");

      close();
    });

    it("resolves with deny when resolved via WS", async () => {
      const { ws, messages, close } = await connectTestWs();

      const reqPromise = app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: { agentId: "test/main", command: "git push --force", severity: 6 },
      });

      const reqMsg = (await waitForMessage(messages, "permission:request")) as {
        payload: PermissionRequestPayload;
      };

      ws.send(
        JSON.stringify({
          type: "permission:response",
          payload: { requestId: reqMsg.payload.requestId, decision: "deny" },
        }),
      );

      const res = await reqPromise;
      expect(res.statusCode).toBe(200);
      expect(res.json().decision).toBe("deny");

      close();
    });

    it("auto-dismisses when agent state changes from waiting", async () => {
      const { messages, close } = await connectTestWs();

      // Start permission request
      const reqPromise = app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: { agentId: "test/agent", command: "npm publish", severity: 5 },
      });

      // Wait for permission:request
      const reqMsg = (await waitForMessage(messages, "permission:request")) as {
        payload: PermissionRequestPayload;
      };

      // Push a state change (agent moved to working, no longer waiting)
      await app.inject({
        method: "POST",
        url: "/api/hook/push",
        payload: { agentId: "test/agent", type: "status", state: "working" },
      });

      // Should get auto-dismiss
      const dismissMsg = await waitForMessage(messages, "permission:autoDismiss");
      expect((dismissMsg as { payload: { requestId: string } }).payload.requestId).toBe(
        reqMsg.payload.requestId,
      );

      // The HTTP request should reject with 410
      const res = await reqPromise;
      expect(res.statusCode).toBe(410);

      close();
    });

    it("returns 400 for invalid payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: { agentId: "test" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("always rules", () => {
    it("returns always decision without bubble when rule matches", async () => {
      const { ws, messages, close } = await connectTestWs();

      // First request - resolve with "always"
      const reqPromise1 = app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: { agentId: "ci/build", command: "npm run build", severity: 3 },
      });

      const reqMsg1 = (await waitForMessage(messages, "permission:request")) as {
        payload: PermissionRequestPayload;
      };

      ws.send(
        JSON.stringify({
          type: "permission:response",
          payload: { requestId: reqMsg1.payload.requestId, decision: "always" },
        }),
      );

      const res1 = await reqPromise1;
      expect(res1.json().decision).toBe("always");

      // Second request with same agent+command prefix - should auto-allow
      const res2 = await app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: { agentId: "ci/build", command: "npm run build --production", severity: 3 },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().decision).toBe("always");

      // No permission:request should have been broadcast for the second one
      const requestMsgs = messages.filter((m) => (m as { type: string }).type === "permission:request");
      expect(requestMsgs.length).toBe(1); // Only the first one

      close();
    });

    it("lists and deletes always rules", async () => {
      // Create a rule via always decision
      const { ws, messages, close } = await connectTestWs();

      const reqPromise = app.inject({
        method: "POST",
        url: "/api/hook/permission",
        payload: { agentId: "test/agent", command: "ls -la", severity: 1 },
      });

      const reqMsg = (await waitForMessage(messages, "permission:request")) as {
        payload: PermissionRequestPayload;
      };

      ws.send(
        JSON.stringify({
          type: "permission:response",
          payload: { requestId: reqMsg.payload.requestId, decision: "always" },
        }),
      );

      await reqPromise;

      // List rules
      const listRes = await app.inject({ method: "GET", url: "/api/hook/always-rules" });
      expect(listRes.statusCode).toBe(200);
      const rules = listRes.json() as Array<{ agentId: string; commandPrefix: string }>;
      expect(rules.length).toBe(1);
      expect(rules[0].agentId).toBe("test/agent");
      expect(rules[0].commandPrefix).toBe("ls -la");

      // Delete rule
      const deleteRes = await app.inject({
        method: "DELETE",
        url: "/api/hook/always-rules",
        payload: { agentId: "test/agent", commandPrefix: "ls -la" },
      });
      expect(deleteRes.statusCode).toBe(204);

      // Verify deleted
      const listRes2 = await app.inject({ method: "GET", url: "/api/hook/always-rules" });
      expect((listRes2.json() as unknown[]).length).toBe(0);

      close();
    });
  });
});
