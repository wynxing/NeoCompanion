import type { FastifyInstance } from "fastify";
import type { AgentState } from "@neo-companion/shared";
import type { createHookManager } from "../services/hook-manager";

type HookManager = ReturnType<typeof createHookManager>;

export function registerHookRoutes(app: FastifyInstance, hookManager: HookManager) {
  app.post("/api/hook/push", async (request, reply) => {
    const body = request.body as { agentId?: string; type?: string; state?: string; description?: string; timestamp?: number };
    if (!body.agentId?.trim()) return reply.code(400).send({ error: "agentId is required" });
    if (body.type !== "status") return reply.code(400).send({ error: "type must be 'status'" });
    if (!body.state) return reply.code(400).send({ error: "state is required" });

    hookManager.pushEvent({
      agentId: body.agentId,
      type: "status",
      state: body.state as AgentState,
      description: body.description,
      timestamp: body.timestamp ?? Date.now()
    });
    return reply.code(204).send();
  });

  app.post("/api/hook/permission", async (request, reply) => {
    const body = request.body as { agentId?: string; command?: string; severity?: number; description?: string };
    if (!body.agentId?.trim()) return reply.code(400).send({ error: "agentId is required" });
    if (!body.command?.trim()) return reply.code(400).send({ error: "command is required" });
    if (typeof body.severity !== "number") return reply.code(400).send({ error: "severity is required" });

    try {
      const response = await hookManager.requestPermission({
        agentId: body.agentId,
        command: body.command,
        severity: body.severity,
        description: body.description
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "permission request failed";
      if (message === "stale" || message === "agentStateChanged") {
        return reply.code(410).send({ error: "request stale" });
      }
      if (message === "shutdown") {
        return reply.code(503).send({ error: "server shutting down" });
      }
      return reply.code(500).send({ error: message });
    }
  });

  app.get("/api/hook/always-rules", async () => hookManager.getAlwaysRules());

  app.delete("/api/hook/always-rules", async (request, reply) => {
    const body = request.body as { agentId?: string; commandPrefix?: string };
    if (!body.agentId?.trim()) return reply.code(400).send({ error: "agentId is required" });
    if (!body.commandPrefix?.trim()) return reply.code(400).send({ error: "commandPrefix is required" });
    hookManager.removeAlwaysRule(body.agentId, body.commandPrefix);
    return reply.code(204).send();
  });
}
