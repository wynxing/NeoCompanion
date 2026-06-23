import type { FastifyInstance } from "fastify";
import type { PermissionDecision } from "@neo-companion/shared";
import type { createHookManager } from "../services/hook-manager";
import type { WsHub } from "../ws-hub";

type HookManager = ReturnType<typeof createHookManager>;

/** Max inbound WS message size (bytes). Oversized messages get close(1009). */
const MAX_MESSAGE_BYTES = 64 * 1024;
/** Max inbound messages per client per window before close(1008). */
const MAX_MESSAGES_PER_WINDOW = 30;
const MESSAGE_WINDOW_MS = 1000;

export function registerWsRoutes(app: FastifyInstance, hub: WsHub, hookManager: HookManager) {
  app.get("/ws", { websocket: true }, (socket) => {
    hub.add(socket);
    // Simple per-connection token bucket for inbound message rate.
    let tokens = MAX_MESSAGES_PER_WINDOW;
    let lastRefill = Date.now();
    const consumeToken = (): boolean => {
      const now = Date.now();
      const elapsed = now - lastRefill;
      tokens = Math.min(MAX_MESSAGES_PER_WINDOW, tokens + (elapsed / MESSAGE_WINDOW_MS) * MAX_MESSAGES_PER_WINDOW);
      lastRefill = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };

    socket.on("message", (raw: Buffer) => {
      if (raw.length > MAX_MESSAGE_BYTES) {
        socket.close(1009, "message too big");
        return;
      }
      if (!consumeToken()) {
        socket.close(1008, "rate limit exceeded");
        return;
      }
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; payload?: Record<string, unknown> };
        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", payload: {} }));
        }
        if (message.type === "permission:response") {
          const payload = message.payload as { requestId?: string; decision?: string };
          if (payload.requestId && payload.decision) {
            hookManager.resolvePermission(payload.requestId, payload.decision as PermissionDecision);
          }
        }
      } catch {
        socket.send(JSON.stringify({ type: "ai:error", payload: { message: "Invalid WS message" } }));
      }
    });
  });
}
