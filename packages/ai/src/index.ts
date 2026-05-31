import { DEFAULT_DEEPSEEK_MODEL, LEGACY_DEEPSEEK_MODELS, type ChatMessage } from "@neo-companion/shared";

export interface DeepSeekOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface DeepSeekRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature: number;
}

export function resolveDeepSeekModel(model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL) {
  if (LEGACY_DEEPSEEK_MODELS.has(model)) {
    return DEFAULT_DEEPSEEK_MODEL;
  }
  return model;
}

export function buildDeepSeekChatRequest(messages: ChatMessage[], model?: string): DeepSeekRequest {
  return {
    model: resolveDeepSeekModel(model),
    messages,
    stream: true,
    temperature: 0.7
  };
}

export async function* streamDeepSeekChat(messages: ChatMessage[], options: DeepSeekOptions = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const response = await fetcher(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildDeepSeekChatRequest(messages, options.model))
  });

  if (!response.ok || !response.body) {
    throw new Error(`DeepSeek request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (data === "[DONE]") return;

      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
