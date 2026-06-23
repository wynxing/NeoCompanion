import type { FastifyInstance } from "fastify";
import type { CompanionFeedback } from "@neo-companion/shared";
import {
  FocusStartBodySchema,
  IdParamSchema,
  type FocusStartBody,
  type IdParam
} from "@neo-companion/shared";
import { NotFoundError } from "../errors";
import type { createFocusManager } from "../services/focus-manager";

type FocusManager = ReturnType<typeof createFocusManager>;

export function registerFocusRoutes(app: FastifyInstance, focus: FocusManager, hub: import("../ws-hub").WsHub) {
  app.post<{ Body: FocusStartBody }>(
    "/api/focus/start",
    { schema: { body: FocusStartBodySchema } },
    async (request) => {
      const session = focus.start(request.body.taskId ?? null, request.body.durationMinutes ?? 25);
      hub.broadcast({
        type: "companion:feedback",
        payload: { state: "focus", text: "我们开始这一轮专注吧，我会安静陪着你。", speak: true } satisfies CompanionFeedback
      });
      return session;
    }
  );

  app.post<{ Params: IdParam }>(
    "/api/focus/:id/complete",
    { schema: { params: IdParamSchema } },
    async (request) => {
      const session = focus.complete(request.params.id);
      if (!session) throw new NotFoundError("focus session", request.params.id);
      return session;
    }
  );
}
