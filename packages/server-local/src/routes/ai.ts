import type { FastifyInstance } from "fastify";
import type { AiService, ChatContextSelection } from "../modules/ai/service";
import { resolveMode } from "../modules/ai/service";

export function registerAiRoutes(app: FastifyInstance, aiService: AiService) {
  app.post("/api/ai/chat", async (request, reply) => {
    const body = request.body as {
      message?: string;
      mode?: string;
      projectId?: string;
      context?: ChatContextSelection;
      conversationId?: string;
    };
    if (!body.message?.trim()) return reply.code(400).send({ error: "message is required" });

    try {
      const mode = resolveMode(body.mode);
      const answer = mode === "ask"
        ? await aiService.handleAsk({ message: body.message, projectId: body.projectId ?? null })
        : await aiService.handleChat({
            message: body.message,
            projectId: body.projectId ?? null,
            context: body.context,
            conversationId: body.conversationId
          });
      return answer;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI request failed";
      return reply.code(500).send({ error: message });
    }
  });
}
