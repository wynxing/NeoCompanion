import type { FastifyInstance } from "fastify";
import { AiChatBodySchema, type AiChatBody } from "@neo-companion/shared";
import type { AiService, ChatContextSelection } from "../modules/ai/service";
import { resolveMode } from "../modules/ai/service";

export function registerAiRoutes(app: FastifyInstance, aiService: AiService) {
  app.post<{ Body: AiChatBody }>(
    "/api/ai/chat",
    { schema: { body: AiChatBodySchema } },
    async (request) => {
      const mode = resolveMode(request.body.mode);
      return mode === "ask"
        ? await aiService.handleAsk({
            message: request.body.message,
            projectId: request.body.projectId ?? null
          })
        : await aiService.handleChat({
            message: request.body.message,
            projectId: request.body.projectId ?? null,
            context: request.body.context as ChatContextSelection | undefined,
            conversationId: request.body.conversationId
          });
    }
  );
}
