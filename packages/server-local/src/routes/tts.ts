import type { FastifyInstance } from "fastify";
import { speakWithMimo } from "@neo-companion/tts";
import type { WsHub } from "../ws-hub";

export function registerTtsRoutes(
  app: FastifyInstance,
  hub: WsHub,
  ttsSpeak: (text: string, style?: string) => Promise<import("@neo-companion/shared").TtsResult>
) {
  app.post("/api/tts/speak", async (request, reply) => {
    const body = request.body as { text?: string; style?: string };
    if (!body.text?.trim()) return reply.code(400).send({ error: "text is required" });

    hub.broadcast({ type: "tts:started", payload: { text: body.text } });
    const result = await (ttsSpeak ?? speakWithMimo)(body.text, body.style ?? "温柔、自然");
    hub.broadcast({ type: "tts:done", payload: result });
    return result;
  });
}
