import type { FastifyInstance } from "fastify";
import type { KnowledgeStore } from "@neo-companion/db";
import type {
  KnowledgeTaskStatus
} from "@neo-companion/shared";
import { exportToDir, importFromDir } from "./mirror";
import type { EmbeddingConfig, KnowledgeService } from "./service";

/** Lets the embedding-config route read/mutate the shared config held in app.ts. */
export interface EmbeddingConfigController {
  get(): EmbeddingConfig;
  set(config: EmbeddingConfig): void;
}

/**
 * Knowledge workspace REST routes (Phase 1 CRUD).
 *
 * The knowledge store requires the sqlite path; when only the memory fallback
 * is reachable (e.g. better-sqlite3 native binding unavailable), `store` is null
 * and these routes return 503 so the rest of the app keeps working.
 *
 * Retrieval (search / index-status / reindex) and AI integration land in
 * Phase 2–4 via modules/knowledge/service.ts.
 */
export function registerKnowledgeRoutes(
  app: FastifyInstance,
  store: KnowledgeStore | null,
  service: KnowledgeService | null,
  embeddingConfigController?: EmbeddingConfigController
) {
  // File-mirror root path. The frontend owns the canonical path in localStorage
  // (useSettings.knowledgeRootPath) and pushes it here so the sidecar can do
  // export/import. Empty until the user picks a folder.
  let rootPath = "";

  const requireStore = (reply: import("fastify").FastifyReply): KnowledgeStore | null => {
    if (!store) {
      reply.code(503).send({ error: "knowledge store unavailable (sqlite not loaded)" });
      return null;
    }
    return store;
  };
  const requireService = (reply: import("fastify").FastifyReply): KnowledgeService | null => {
    if (!service) {
      reply.code(503).send({ error: "knowledge index unavailable (sqlite not loaded)" });
      return null;
    }
    return service;
  };

  // ── Projects ──
  app.get("/api/knowledge/projects", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const query = request.query as { parentId?: string; root?: string };
    if (query.parentId) return kw.childProjects(query.parentId);
    if (query.root === "1") {
      return kw.listProjects().filter((p) => p.parentId === null);
    }
    return kw.listProjects();
  });

  app.get("/api/knowledge/projects/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const project = kw.getProject(id);
    if (!project) return reply.code(404).send({ error: "project not found" });
    return project;
  });

  app.get("/api/knowledge/projects/:id/path", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    return kw.projectPath(id);
  });

  app.post("/api/knowledge/projects", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const body = request.body as { title?: string; parentId?: string | null; description?: string; color?: string; icon?: string };
    if (!body.title?.trim()) return reply.code(400).send({ error: "title is required" });
    return kw.createProject({ title: body.title, parentId: body.parentId ?? null, description: body.description, color: body.color, icon: body.icon });
  });

  app.patch("/api/knowledge/projects/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; description?: string; color?: string; icon?: string; parentId?: string | null; order?: number };
    const project = kw.updateProject(id, body);
    if (!project) return reply.code(404).send({ error: "project not found" });
    return project;
  });

  app.delete("/api/knowledge/projects/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    kw.deleteProject(id);
    return reply.code(204).send();
  });

  // ── Notes ──
  app.get("/api/knowledge/projects/:id/notes", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    return kw.notesForProject(id);
  });

  app.post("/api/knowledge/projects/:id/notes", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string };
    const note = kw.createNote(id, body.title?.trim() || "无标题笔记");
    service?.reindexNote(note);
    return note;
  });

  app.get("/api/knowledge/notes/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const note = kw.getNote(id);
    if (!note) return reply.code(404).send({ error: "note not found" });
    return note;
  });

  app.patch("/api/knowledge/notes/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; body?: string; tags?: string[] };
    const note = kw.updateNote(id, body);
    if (!note) return reply.code(404).send({ error: "note not found" });
    service?.reindexNote(note);
    return note;
  });

  app.delete("/api/knowledge/notes/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    kw.deleteNote(id);
    service && kw; // removeIndex handled by store.deleteNote cascade (chunks deleted)
    return reply.code(204).send();
  });

  app.get("/api/knowledge/notes/:id/backlinks", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    return kw.backlinksFor(id);
  });

  // ── Board columns ──
  app.get("/api/knowledge/projects/:id/columns", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    return kw.columnsForProject(id);
  });

  app.post("/api/knowledge/projects/:id/columns", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; status?: KnowledgeTaskStatus; order?: number };
    if (!body.title?.trim()) return reply.code(400).send({ error: "title is required" });
    return kw.createColumn(id, { title: body.title, status: body.status ?? "todo", order: body.order ?? 0 });
  });

  app.patch("/api/knowledge/columns/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; status?: KnowledgeTaskStatus; order?: number };
    const column = kw.updateColumn(id, body);
    if (!column) return reply.code(404).send({ error: "column not found" });
    return column;
  });

  app.delete("/api/knowledge/columns/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    kw.deleteColumn(id);
    return reply.code(204).send();
  });

  // ── Tasks ──
  app.get("/api/knowledge/projects/:id/tasks", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    return kw.tasksForProject(id);
  });

  app.post("/api/knowledge/projects/:id/tasks", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { columnId?: string; title?: string };
    if (!body.title?.trim()) return reply.code(400).send({ error: "title is required" });
    const task = kw.createTask(id, body.columnId ?? "", body.title);
    service?.reindexTask(task);
    return task;
  });

  app.patch("/api/knowledge/tasks/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; description?: string; status?: KnowledgeTaskStatus; columnId?: string; order?: number; linkedNoteId?: string | null };
    const task = kw.updateTask(id, body);
    if (!task) return reply.code(404).send({ error: "task not found" });
    if (body.title !== undefined || body.description !== undefined) service?.reindexTask(task);
    return task;
  });

  app.delete("/api/knowledge/tasks/:id", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    kw.deleteTask(id);
    return reply.code(204).send();
  });

  app.post("/api/knowledge/tasks/:id/move", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const { id } = request.params as { id: string };
    const body = request.body as { columnId?: string; index?: number };
    kw.moveTask(id, body.columnId ?? "", body.index ?? 0);
    return reply.code(204).send();
  });

  // ── Retrieval (Phase 2: FTS5; Phase 3 adds vec + RRF) ──
  app.get("/api/knowledge/search", async (request, reply) => {
    const svc = requireService(reply);
    if (!svc) return;
    const query = request.query as { q?: string; projectId?: string; limit?: string };
    if (!query.q?.trim()) return reply.code(400).send({ error: "q is required" });
    const limit = query.limit ? Number.parseInt(query.limit, 10) : 20;
    return svc.searchHybrid(query.projectId ?? null, query.q, Number.isFinite(limit) ? limit : 20);
  });

  app.get("/api/knowledge/index-status", async (request, reply) => {
    const svc = requireService(reply);
    if (!svc) return;
    return svc.indexStatus();
  });

  app.post("/api/knowledge/reindex", async (request, reply) => {
    const svc = requireService(reply);
    if (!svc) return;
    const body = (request.body as { embeddingModel?: string } | null) ?? {};
    if (body.embeddingModel) svc.markStale(body.embeddingModel);
    return svc.reindexAll();
  });

  // ── Embedding provider config (Phase 3) ──
  // Persisted to app_config (survives restart); apiKey lives only in the local
  // db file and is never echoed back. apiKey is optional — when absent the
  // service falls back to the EMBEDDING_API_KEY env var.
  app.get("/api/knowledge/embedding-config", async () => {
    const cfg = embeddingConfigController?.get() ?? { provider: "none" };
    const hasStoredKey = !!cfg.apiKey;
    const hasEnvKey = !!process.env.EMBEDDING_API_KEY;
    return {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl ?? "",
      model: cfg.model ?? "",
      configured: cfg.provider !== "none" && !!cfg.model && (hasStoredKey || hasEnvKey),
      apiKeySource: hasStoredKey ? "stored" : hasEnvKey ? "env" : "none"
    };
  });

  app.put("/api/knowledge/embedding-config", async (request, reply) => {
    if (!embeddingConfigController) return reply.code(503).send({ error: "embedding config unavailable" });
    const body = request.body as Partial<EmbeddingConfig>;
    const current = embeddingConfigController.get();
    // A non-empty apiKey overwrites the stored secret; an absent/empty apiKey
    // keeps the existing stored key (UI masks the secret). To switch to env-var
    // mode the client sends an explicit apiKey: null which clears the stored key.
    let apiKey: string | undefined;
    if (body.apiKey) {
      apiKey = body.apiKey;
    } else if (body.apiKey === null) {
      apiKey = undefined; // clear stored key → fall back to env var
    } else {
      apiKey = current.apiKey;
    }
    const next: EmbeddingConfig = {
      provider: body.provider ?? current.provider,
      baseUrl: body.baseUrl ?? current.baseUrl,
      apiKey,
      model: body.model ?? current.model
    };
    embeddingConfigController.set(next);
    // model change → mark stale so chunks re-embed with the new model
    if (next.model && next.model !== current.model) {
      service?.markStale(next.model);
    }
    await service?.drainEmbeddings();
    return { ok: true };
  });

  // ── File mirror (hybrid SQLite + Markdown/JSONL) ──
  app.get("/api/knowledge/root-path", async () => ({ path: rootPath }));

  app.put("/api/knowledge/root-path", async (request, reply) => {
    const body = request.body as { path?: string };
    rootPath = (body.path ?? "").trim();
    return { path: rootPath };
  });

  app.post("/api/knowledge/mirror/export", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const body = (request.body as { path?: string } | null) ?? {};
    const target = (body.path ?? rootPath).trim();
    if (!target) return reply.code(400).send({ error: "rootPath not set" });
    const stats = await exportToDir(kw, target);
    return stats;
  });

  app.post("/api/knowledge/mirror/import", async (request, reply) => {
    const kw = requireStore(reply);
    if (!kw) return;
    const body = (request.body as { path?: string } | null) ?? {};
    const source = (body.path ?? rootPath).trim();
    if (!source) return reply.code(400).send({ error: "rootPath not set" });
    const stats = await importFromDir(kw, source);
    return stats;
  });
}
