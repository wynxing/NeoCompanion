import type { FastifyInstance } from "fastify";
import type { AgentState } from "@neo-companion/shared";
import {
  HookPushBodySchema,
  HookPermissionBodySchema,
  HookAlwaysRuleDeleteBodySchema,
  type HookPushBody,
  type HookPermissionBody,
  type HookAlwaysRuleDeleteBody
} from "@neo-companion/shared";
import { StaleError, ServiceUnavailableError } from "../errors";
import type { createHookManager } from "../services/hook-manager";

type HookManager = ReturnType<typeof createHookManager>;

export function registerHookRoutes(app: FastifyInstance, hookManager: HookManager) {
  app.post<{ Body: HookPushBody }>(
    "/api/hook/push",
    { schema: { body: HookPushBodySchema } },
    async (request, reply) => {
      hookManager.pushEvent({
        agentId: request.body.agentId,
        type: "status",
        state: request.body.state as AgentState,
        description: request.body.description,
        timestamp: request.body.timestamp ?? Date.now()
      });
      return reply.code(204).send();
    }
  );

  app.post<{ Body: HookPermissionBody }>(
    "/api/hook/permission",
    { schema: { body: HookPermissionBodySchema } },
    async (request) => {
      try {
        return await hookManager.requestPermission({
          agentId: request.body.agentId,
          command: request.body.command,
          severity: request.body.severity,
          description: request.body.description
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "permission request failed";
        if (message === "stale" || message === "agentStateChanged") {
          throw new StaleError("request stale");
        }
        if (message === "shutdown") {
          throw new ServiceUnavailableError("server shutting down");
        }
        throw error;
      }
    }
  );

  app.get("/api/hook/always-rules", async () => hookManager.getAlwaysRules());

  app.delete<{ Body: HookAlwaysRuleDeleteBody }>(
    "/api/hook/always-rules",
    { schema: { body: HookAlwaysRuleDeleteBodySchema } },
    async (request, reply) => {
      hookManager.removeAlwaysRule(request.body.agentId, request.body.commandPrefix);
      return reply.code(204).send();
    }
  );
}
