import type { FastifyInstance } from "fastify";
import type { CompanionFeedback } from "@neo-companion/shared";
import type { createFocusManager } from "../services/focus-manager";

type FocusManager = ReturnType<typeof createFocusManager>;

export function registerFocusRoutes(app: FastifyInstance, focus: FocusManager, hub: import("../ws-hub").WsHub) {
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
}
