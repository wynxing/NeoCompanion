import type { ChatMessage, TtsResult } from "@neo-companion/shared";
import { Buffer } from "node:buffer";

export interface MimoTtsOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  voice?: string;
  responseFormat?: "mp3" | "wav";
  fetchImpl?: typeof fetch;
}

export interface MimoTtsRequest {
  model: string;
  voice: string;
  response_format: "mp3" | "wav";
  messages: ChatMessage[];
}

export const DEFAULT_MIMO_TTS_MODEL = "mimo-v2.5-tts";
export const DEFAULT_MIMO_TTS_VOICE = "茉莉";

export function buildMimoTtsRequest(text: string, styleInstruction?: string, options: MimoTtsOptions = {}): MimoTtsRequest {
  const messages: ChatMessage[] = [];
  if (styleInstruction?.trim()) {
    messages.push({ role: "user", content: styleInstruction.trim() });
  }
  messages.push({ role: "assistant", content: text.trim() });

  return {
    model: options.model ?? process.env.MIMO_TTS_MODEL ?? DEFAULT_MIMO_TTS_MODEL,
    voice: options.voice ?? process.env.MIMO_TTS_VOICE ?? DEFAULT_MIMO_TTS_VOICE,
    response_format: options.responseFormat ?? "mp3",
    messages
  };
}

export async function speakWithMimo(text: string, styleInstruction?: string, options: MimoTtsOptions = {}): Promise<TtsResult> {
  const apiKey = options.apiKey ?? process.env.MIMO_API_KEY;
  if (!apiKey) {
    throw new Error("Missing MIMO_API_KEY");
  }

  const endpoint = options.baseUrl ?? process.env.MIMO_TTS_BASE_URL;
  if (!endpoint) {
    throw new Error("Missing MIMO_TTS_BASE_URL. See docs/TTS_SETUP.md.");
  }

  const request = buildMimoTtsRequest(text, styleInstruction, options);
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`MiMo TTS request failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return {
    audioUrl: `data:audio/${request.response_format};base64,${base64}`,
    format: request.response_format,
    provider: "mimo",
    cached: false
  };
}
