/**
 * OpenAI-compatible embedding adapter. Mirrors streamDeepSeekChat's option/env
 * resolution so the embedding provider stays decoupled from the chat provider
 * (DeepSeek has no embeddings endpoint).
 */
export interface EmbeddingOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface EmbeddingResult {
  vectors: number[][];
  dimensions: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

/** Thrown for non-retryable failures (4xx except 429); escapes the retry loop. */
class NonRetryableError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embed a batch of texts in a single /v1/embeddings request. Returns vectors in
 * input order plus the discovered dimension (from the first vector).
 */
export async function embedContents(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
  if (texts.length === 0) {
    return { vectors: [], dimensions: 0 };
  }

  const apiKey = options.apiKey ?? process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new Error("Missing EMBEDDING_API_KEY");
  }

  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? process.env.EMBEDDING_BASE_URL ?? "https://api.openai.com";
  const model = options.model ?? process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model, input: texts }),
        signal: controller.signal
      });

      if (!response.ok) {
        // Retry on 5xx / 429; fail fast on 4xx (except 429).
        if (response.status >= 500 || response.status === 429) {
          lastError = new Error(`Embedding request failed: ${response.status} ${response.statusText}`);
        } else {
          throw new NonRetryableError(`Embedding request failed: ${response.status} ${response.statusText}`);
        }
      } else {
        const parsed = (await response.json()) as OpenAIEmbeddingResponse;
        const data = parsed.data ?? [];
        if (data.length !== texts.length) {
          throw new Error(`Embedding count mismatch: expected ${texts.length}, got ${data.length}`);
        }
        // Re-sort by index in case the provider returns out of order.
        const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        const vectors = sorted.map((d) => d.embedding ?? []);
        const dimensions = vectors[0]?.length ?? 0;
        return { vectors, dimensions };
      }
    } catch (error) {
      // Non-retryable errors propagate immediately; everything else retries.
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxRetries - 1) {
      await sleep(2 ** attempt * 500); // 500ms, 1s, 2s
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Embedding request failed");
}
