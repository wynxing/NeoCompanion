import type { FastifyInstance } from "fastify";
import { speakWithMimo } from "@neo-companion/tts";
import { TtsSpeakBodySchema, type TtsSpeakBody } from "@neo-companion/shared";
import type { WsHub } from "../ws-hub";

export function registerTtsRoutes(
  app: FastifyInstance,
  hub: WsHub,
  ttsSpeak: (text: string, style?: string) => Promise<import("@neo-companion/shared").TtsResult>
) {
  app.post<{ Body: TtsSpeakBody }>(
    "/api/tts/speak",
    { schema: { body: TtsSpeakBodySchema } },
    async (request) => {
      const { text, style } = request.body;
      hub.broadcast({ type: "tts:started", payload: { text } });
      try {
        const result = await (ttsSpeak ?? speakWithMimo)(text, style ?? "温柔、自然");
        hub.broadcast({ type: "tts:done", payload: result });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "TTS synthesis failed";
        // Notify the frontend that the started TTS won't complete.
        hub.broadcast({ type: "tts:error", payload: { message, text } });
        throw error;
      }
    }
  );
}
