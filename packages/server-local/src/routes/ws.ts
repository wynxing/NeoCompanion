import type { FastifyInstance } from "fastify";
import type { PermissionDecision } from "@neo-companion/shared";
import type { createHookManager } from "../services/hook-manager";
import type { WsHub } from "../ws-hub";

type HookManager = ReturnType<typeof createHookManager>;

export function registerWsRoutes(app: FastifyInstance, hub: WsHub, hookManager: HookManager) {
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
            hookManager.resolvePermission(payload.requestId, payload.decision as PermissionDecision);
          }
        }
      } catch {
        socket.send(JSON.stringify({ type: "ai:error", payload: { message: "Invalid WS message" } }));
      }
    });
  });
}
