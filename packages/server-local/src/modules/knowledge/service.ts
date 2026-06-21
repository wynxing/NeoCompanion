import type { KnowledgeStore } from "@neo-companion/db";
import type { KnowledgeNote, KnowledgeTask, KnowledgeTaskStatus, KnowledgeSource, IndexStatus } from "@neo-companion/shared";
import { chunkMarkdown, chunkTask, resolveChunkingConfig, type Chunk } from "./chunker";
import { fuseRrf } from "./rrf";

/** Embedding provider config pushed from the client (see /embedding-config route). */
export interface EmbeddingConfig {
  provider: string; // "none" | "openai" | "cohere" | "local" | ...
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  apiKeySource?: "keychain" | "env" | "legacy" | "none";
}

export interface EmbeddingCallOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export type EmbedFn = (texts: string[], options: EmbeddingCallOptions) => Promise<{ vectors: number[][]; dimensions: number }>;

export interface KnowledgeServiceOptions {
  embedFn?: EmbedFn;
  getEmbeddingConfig?: () => EmbeddingConfig | null;
}

const DRAIN_BATCH = 64;

/**
 * Knowledge service: wraps the store so every note/task write triggers a
 * re-chunk + FTS5 sync. The chunker is pure (in this package); the store owns
 * the raw sqlite FTS writes. This keeps the db package free of a
 * server-local dependency. Phase 3 adds an async embedding drain that consumes
 * pending chunks into the vec0 table, plus hybrid (FTS5 + vector RRF) search.
 */
export function createKnowledgeService(store: KnowledgeStore, options: KnowledgeServiceOptions = {}) {
  const config = resolveChunkingConfig();
  const { embedFn, getEmbeddingConfig } = options;

  function chunkNoteText(text: string): { content: string; contentHash: string }[] {
    return chunkMarkdown(text, config).map((c: Chunk) => ({ content: c.content, contentHash: c.contentHash }));
  }
  function chunkTaskText(text: string): { content: string; contentHash: string }[] {
    return chunkTask("", text, config).map((c: Chunk) => ({ content: c.content, contentHash: c.contentHash }));
  }

  function embeddingConfig(): EmbeddingConfig | null {
    return getEmbeddingConfig?.() ?? null;
  }
  /** Resolved API key: stored config value, else env EMBEDDING_API_KEY. */
  function resolvedApiKey(): string | undefined {
    const cfg = embeddingConfig();
    return cfg?.apiKey || process.env.EMBEDDING_API_KEY || undefined;
  }
  function providerConfigured(): boolean {
    const cfg = embeddingConfig();
    return !!cfg && cfg.provider !== "none" && !!cfg.model && !!resolvedApiKey();
  }
  function embedCallOptions(): EmbeddingCallOptions {
    const cfg = embeddingConfig() ?? { provider: "none" };
    return { apiKey: resolvedApiKey(), baseUrl: cfg.baseUrl, model: cfg.model };
  }

  let draining = false;
  let retryTimer: NodeJS.Timeout | null = null;
  function scheduleRetry(): void {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void drainEmbeddingQueue();
    }, 60_000);
    retryTimer.unref();
  }
  /**
   * Consume pending/stale chunks: embed in batches (with content-hash cache
   * reuse), write vectors into vec0, mark indexed/failed. Single-flight via the
   * `draining` flag. No-op when vec/embedding unavailable. Fire-and-forget from
   * write paths; awaited from explicit reindex.
   */
  async function drainEmbeddingQueue(): Promise<void> {
    if (draining) return;
    if (!embedFn || !store.vecLoaded || !providerConfigured()) return;
    draining = true;
    try {
      const model = embeddingConfig()!.model!;
      while (true) {
        const pending = store.listPendingChunks(DRAIN_BATCH);
        if (!pending.length) break;

        const cached: Array<{ chunk: (typeof pending)[number]; emb: { vector: number[]; dimensions: number } }> = [];
        const need: Array<{ chunk: (typeof pending)[number]; idx: number }> = [];
        for (const chunk of pending) {
          const hit = store.getCachedEmbedding(chunk.contentHash, model);
          if (hit) cached.push({ chunk, emb: hit });
          else need.push({ chunk, idx: need.length });
        }

        let dim: number | null = null;
        let newVecs: number[][] = [];

        if (need.length) {
          try {
            const result = await embedFn(need.map((n) => n.chunk.content), embedCallOptions());
            dim = result.dimensions;
            if (!store.ensureVecTable(dim)) break;
            newVecs = result.vectors;
            for (const n of need) {
              const v = newVecs[n.idx];
              if (!v || v.length !== dim) {
                store.markChunkFailed(n.chunk.id, "embedding dimension mismatch");
                continue;
              }
              store.putVecChunk(n.chunk.id, n.chunk.projectId, v);
              store.putCachedEmbedding(n.chunk.contentHash, v, model, dim);
              store.markChunkIndexed(n.chunk.id, model, dim);
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : "embedding failed";
            for (const n of need) store.markChunkFailed(n.chunk.id, msg);
            scheduleRetry();
            break; // avoid tight retry loop; next write/reindex re-triggers
          }
        }

        for (const c of cached) {
          if (dim === null) dim = c.emb.dimensions;
          if (!store.ensureVecTable(dim)) break;
          store.putVecChunk(c.chunk.id, c.chunk.projectId, c.emb.vector);
          store.markChunkIndexed(c.chunk.id, model, dim);
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    config,

    reindexNote(note: KnowledgeNote): void {
      store.reindexNote(note, chunkNoteText);
      void drainEmbeddingQueue();
    },

    reindexTask(task: KnowledgeTask): void {
      store.reindexTask(task, (text) => chunkTaskText(text));
      void drainEmbeddingQueue();
    },

    /** Synchronous FTS5-only search (kept for backward-compatible tests). */
    search(projectId: string | null, query: string, limit = 20): KnowledgeSource[] {
      return store.searchFts(projectId, query, limit);
    },

    /** Hybrid search: FTS5 BM25 + sqlite-vec KNN fused via RRF. Falls back to
     * FTS-only when vec/embedding is unavailable or the query embedding fails. */
    async searchHybrid(projectId: string | null, query: string, limit = 20): Promise<KnowledgeSource[]> {
      const fts = store.searchFts(projectId, query, limit);
      if (!store.vecLoaded || !providerConfigured() || !embedFn) return fts;
      try {
        const result = await embedFn([query], embedCallOptions());
        const queryVec = result.vectors[0];
        if (!queryVec) return fts;
        const knn = store.searchKnn(queryVec, limit, projectId);
        if (!knn.length) return fts;
        return fuseRrf(fts, knn).slice(0, Math.max(1, Math.min(limit, 50)));
      } catch {
        return fts;
      }
    },

    indexStatus(): IndexStatus {
      return store.getIndexStatus(providerConfigured());
    },

    getChunkContents(chunkIds: string[]): Map<string, string> {
      return store.getChunkContents(chunkIds);
    },

    markStale(embeddingModel?: string): void {
      store.markStale(embeddingModel);
      void drainEmbeddingQueue();
    },

    /** Explicit rebuild: re-chunk everything, then drain embeddings. */
    async reindexAll(): Promise<{ notes: number; tasks: number }> {
      let notes = 0;
      let tasks = 0;
      for (const project of store.listProjects()) {
        for (const note of store.notesForProject(project.id)) {
          store.reindexNote(note, chunkNoteText);
          notes += 1;
        }
        for (const task of store.tasksForProject(project.id)) {
          store.reindexTask(task, (text) => chunkTaskText(text));
          tasks += 1;
        }
      }
      await drainEmbeddingQueue();
      return { notes, tasks };
    },

    /** Trigger embedding drain without re-chunking (e.g. after config change). */
    async drainEmbeddings(): Promise<void> {
      await drainEmbeddingQueue();
    }
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;

// re-export status type for route typing
export type { KnowledgeTaskStatus };
