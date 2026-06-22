import type { FastifyInstance } from "fastify";
import type { CompanionFeedback } from "@neo-companion/shared";
import type { NeoDatabase } from "@neo-companion/db";
import { createWindowEventStore } from "@neo-companion/db";
import type { getActiveWindowSnapshot } from "../services/window-service";
import type { WsHub } from "../ws-hub";

export interface WindowRouteContext {
  database: NeoDatabase;
  hub: WsHub;
  snapshot: typeof getActiveWindowSnapshot;
}

export function registerWindowRoutes(app: FastifyInstance, ctx: WindowRouteContext) {
  const windowStore = createWindowEventStore(ctx.database);

  app.get("/api/window/active", async () => {
    const snapshot = await ctx.snapshot();
    windowStore.create(snapshot);
    ctx.hub.broadcast({ type: "window:activeChanged", payload: snapshot });
    if (snapshot.classification === "distracted") {
      ctx.hub.broadcast({
        type: "companion:feedback",
        payload: { state: "warn", text: "好像有点偏离啦，要不要先回到刚才的任务？", speak: true } satisfies CompanionFeedback
      });
    }
    return snapshot;
  });
}
