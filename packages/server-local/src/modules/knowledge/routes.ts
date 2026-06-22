import type { FastifyInstance } from "fastify";
import type { KnowledgeStore } from "@neo-companion/db";
import {
  ProjectListQuerySchema,
  ProjectIdParamSchema,
  ProjectCreateBodySchema,
  ProjectPatchBodySchema,
  NoteCreateBodySchema,
  NoteIdParamSchema,
  NotePatchBodySchema,
  ColumnCreateBodySchema,
  ColumnIdParamSchema,
  ColumnPatchBodySchema,
  KnowledgeTaskCreateBodySchema,
  KnowledgeTaskPatchBodySchema,
  TaskIdParamSchema,
  KnowledgeTaskMoveBodySchema,
  KnowledgeSearchQuerySchema,
  KnowledgeReindexBodySchema,
  EmbeddingConfigBodySchema,
  RootPathBodySchema,
  MirrorPathBodySchema,
  type ProjectListQuery,
  type ProjectIdParam,
  type ProjectCreateBody,
  type ProjectPatchBody,
  type NoteCreateBody,
  type NoteIdParam,
  type NotePatchBody,
  type ColumnCreateBody,
  type ColumnIdParam,
  type ColumnPatchBody,
  type KnowledgeTaskCreateBody,
  type KnowledgeTaskPatchBody,
  type TaskIdParam,
  type KnowledgeTaskMoveBody,
  type KnowledgeSearchQuery,
  type KnowledgeReindexBody,
  type EmbeddingConfigBody,
  type RootPathBody,
  type MirrorPathBody
} from "@neo-companion/shared";
import { NotFoundError, ServiceUnavailableError, BadRequestError } from "../../errors";
import { exportToDir, importFromDir } from "./mirror";
import type { EmbeddingConfig, KnowledgeService } from "./service";

/** Lets the embedding-config route read/mutate the shared config held in app.ts. */
export interface EmbeddingConfigController {
  get(): EmbeddingConfig;
  set(config: EmbeddingConfig): void;
  getLegacySecret(): string | undefined;
  clearLegacySecret(): void;
}
export interface RootPathController {
  get(): string;
  set(path: string): void;
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
  embeddingConfigController?: EmbeddingConfigController,
  rootPathController?: RootPathController
) {
  // File-mirror root path. The frontend owns the canonical path in localStorage
  // (useSettings.knowledgeRootPath) and pushes it here so the sidecar can do
  // export/import. Empty until the user picks a folder.
  let rootPath = rootPathController?.get() ?? "";

  const requireStore = (): KnowledgeStore => {
    if (!store) throw new ServiceUnavailableError("knowledge store unavailable (sqlite not loaded)");
    return store;
  };
  const requireService = (): KnowledgeService => {
    if (!service) throw new ServiceUnavailableError("knowledge index unavailable (sqlite not loaded)");
    return service;
  };

  // ── Projects ──
  app.get<{ Querystring: ProjectListQuery }>(
    "/api/knowledge/projects",
    { schema: { querystring: ProjectListQuerySchema } },
    async (request) => {
      const kw = requireStore();
      if (request.query.parentId) return kw.childProjects(request.query.parentId);
      if (request.query.root === "1") {
        return kw.listProjects().filter((p) => p.parentId === null);
      }
      return kw.listProjects();
    }
  );

  app.get<{ Params: ProjectIdParam }>(
    "/api/knowledge/projects/:id",
    { schema: { params: ProjectIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      const project = kw.getProject(request.params.id);
      if (!project) throw new NotFoundError("project", request.params.id);
      return project;
    }
  );

  app.get<{ Params: ProjectIdParam }>(
    "/api/knowledge/projects/:id/path",
    { schema: { params: ProjectIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      return kw.projectPath(request.params.id);
    }
  );

  app.post<{ Body: ProjectCreateBody }>(
    "/api/knowledge/projects",
    { schema: { body: ProjectCreateBodySchema } },
    async (request) => {
      const kw = requireStore();
      return kw.createProject({
        title: request.body.title,
        parentId: request.body.parentId ?? null,
        description: request.body.description,
        color: request.body.color,
        icon: request.body.icon
      });
    }
  );

  app.patch<{ Params: ProjectIdParam; Body: ProjectPatchBody }>(
    "/api/knowledge/projects/:id",
    { schema: { params: ProjectIdParamSchema, body: ProjectPatchBodySchema } },
    async (request) => {
      const kw = requireStore();
      const project = kw.updateProject(request.params.id, request.body);
      if (!project) throw new NotFoundError("project", request.params.id);
      return project;
    }
  );

  app.delete<{ Params: ProjectIdParam }>(
    "/api/knowledge/projects/:id",
    { schema: { params: ProjectIdParamSchema } },
    async (request, reply) => {
      const kw = requireStore();
      kw.deleteProject(request.params.id);
      return reply.code(204).send();
    }
  );

  // ── Notes ──
  app.get<{ Params: ProjectIdParam }>(
    "/api/knowledge/projects/:id/notes",
    { schema: { params: ProjectIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      return kw.notesForProject(request.params.id);
    }
  );

  app.post<{ Params: ProjectIdParam; Body: NoteCreateBody }>(
    "/api/knowledge/projects/:id/notes",
    { schema: { params: ProjectIdParamSchema, body: NoteCreateBodySchema } },
    async (request) => {
      const kw = requireStore();
      const note = kw.createNote(request.params.id, request.body.title?.trim() || "无标题笔记");
      service?.reindexNote(note);
      return note;
    }
  );

  app.get<{ Params: NoteIdParam }>(
    "/api/knowledge/notes/:id",
    { schema: { params: NoteIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      const note = kw.getNote(request.params.id);
      if (!note) throw new NotFoundError("note", request.params.id);
      return note;
    }
  );

  app.patch<{ Params: NoteIdParam; Body: NotePatchBody }>(
    "/api/knowledge/notes/:id",
    { schema: { params: NoteIdParamSchema, body: NotePatchBodySchema } },
    async (request) => {
      const kw = requireStore();
      const note = kw.updateNote(request.params.id, request.body);
      if (!note) throw new NotFoundError("note", request.params.id);
      service?.reindexNote(note);
      return note;
    }
  );

  app.delete<{ Params: NoteIdParam }>(
    "/api/knowledge/notes/:id",
    { schema: { params: NoteIdParamSchema } },
    async (request, reply) => {
      const kw = requireStore();
      kw.deleteNote(request.params.id);
      // removeIndex handled by store.deleteNote cascade (chunks deleted)
      return reply.code(204).send();
    }
  );

  app.get<{ Params: NoteIdParam }>(
    "/api/knowledge/notes/:id/backlinks",
    { schema: { params: NoteIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      return kw.backlinksFor(request.params.id);
    }
  );

  // ── Board columns ──
  app.get<{ Params: ProjectIdParam }>(
    "/api/knowledge/projects/:id/columns",
    { schema: { params: ProjectIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      return kw.columnsForProject(request.params.id);
    }
  );

  app.post<{ Params: ProjectIdParam; Body: ColumnCreateBody }>(
    "/api/knowledge/projects/:id/columns",
    { schema: { params: ProjectIdParamSchema, body: ColumnCreateBodySchema } },
    async (request) => {
      const kw = requireStore();
      return kw.createColumn(request.params.id, {
        title: request.body.title,
        status: request.body.status ?? "todo",
        order: request.body.order ?? 0
      });
    }
  );

  app.patch<{ Params: ColumnIdParam; Body: ColumnPatchBody }>(
    "/api/knowledge/columns/:id",
    { schema: { params: ColumnIdParamSchema, body: ColumnPatchBodySchema } },
    async (request) => {
      const kw = requireStore();
      const column = kw.updateColumn(request.params.id, request.body);
      if (!column) throw new NotFoundError("column", request.params.id);
      return column;
    }
  );

  app.delete<{ Params: ColumnIdParam }>(
    "/api/knowledge/columns/:id",
    { schema: { params: ColumnIdParamSchema } },
    async (request, reply) => {
      const kw = requireStore();
      kw.deleteColumn(request.params.id);
      return reply.code(204).send();
    }
  );

  // ── Tasks ──
  app.get<{ Params: ProjectIdParam }>(
    "/api/knowledge/projects/:id/tasks",
    { schema: { params: ProjectIdParamSchema } },
    async (request) => {
      const kw = requireStore();
      return kw.tasksForProject(request.params.id);
    }
  );

  app.post<{ Params: ProjectIdParam; Body: KnowledgeTaskCreateBody }>(
    "/api/knowledge/projects/:id/tasks",
    { schema: { params: ProjectIdParamSchema, body: KnowledgeTaskCreateBodySchema } },
    async (request) => {
      const kw = requireStore();
      const task = kw.createTask(request.params.id, request.body.columnId ?? "", request.body.title);
      service?.reindexTask(task);
      return task;
    }
  );

  app.patch<{ Params: TaskIdParam; Body: KnowledgeTaskPatchBody }>(
    "/api/knowledge/tasks/:id",
    { schema: { params: TaskIdParamSchema, body: KnowledgeTaskPatchBodySchema } },
    async (request) => {
      const kw = requireStore();
      const task = kw.updateTask(request.params.id, request.body);
      if (!task) throw new NotFoundError("task", request.params.id);
      if (request.body.title !== undefined || request.body.description !== undefined) {
        service?.reindexTask(task);
      }
      return task;
    }
  );

  app.delete<{ Params: TaskIdParam }>(
    "/api/knowledge/tasks/:id",
    { schema: { params: TaskIdParamSchema } },
    async (request, reply) => {
      const kw = requireStore();
      kw.deleteTask(request.params.id);
      return reply.code(204).send();
    }
  );

  app.post<{ Params: TaskIdParam; Body: KnowledgeTaskMoveBody }>(
    "/api/knowledge/tasks/:id/move",
    { schema: { params: TaskIdParamSchema, body: KnowledgeTaskMoveBodySchema } },
    async (request, reply) => {
      const kw = requireStore();
      kw.moveTask(request.params.id, request.body.columnId ?? "", request.body.index ?? 0);
      return reply.code(204).send();
    }
  );

  // ── Retrieval (Phase 2: FTS5; Phase 3 adds vec + RRF) ──
  app.get<{ Querystring: KnowledgeSearchQuery }>(
    "/api/knowledge/search",
    { schema: { querystring: KnowledgeSearchQuerySchema } },
    async (request) => {
      const svc = requireService();
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 20;
      return svc.searchHybrid(request.query.projectId ?? null, request.query.q, Number.isFinite(limit) ? limit : 20);
    }
  );

  app.get("/api/knowledge/index-status", async () => {
    const svc = requireService();
    return svc.indexStatus();
  });

  app.post<{ Body: KnowledgeReindexBody }>(
    "/api/knowledge/reindex",
    { schema: { body: KnowledgeReindexBodySchema } },
    async (request) => {
      const svc = requireService();
      if (request.body.embeddingModel) svc.markStale(request.body.embeddingModel);
      return svc.reindexAll();
    }
  );

  // ── Embedding provider config (Phase 3) ──
  // Persisted to app_config (survives restart); apiKey lives only in the local
  // db file and is never echoed back. apiKey is optional — when absent the
  // service falls back to the EMBEDDING_API_KEY env var.
  app.get("/api/knowledge/embedding-config", async () => {
    const cfg = embeddingConfigController?.get() ?? { provider: "none" };
    const hasRuntimeKey = !!cfg.apiKey;
    const hasLegacyKey = !!embeddingConfigController?.getLegacySecret();
    const hasEnvKey = !!process.env.EMBEDDING_API_KEY;
    return {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl ?? "",
      model: cfg.model ?? "",
      configured: cfg.provider !== "none" && !!cfg.model && (hasRuntimeKey || hasLegacyKey || hasEnvKey),
      apiKeySource: hasLegacyKey ? "legacy" : cfg.apiKeySource === "keychain" ? "keychain" : hasEnvKey ? "env" : "none",
      legacyMigrationRequired: hasLegacyKey
    };
  });

  app.post("/api/knowledge/embedding-config/legacy-secret/claim", async () => {
    const apiKey = embeddingConfigController?.getLegacySecret();
    if (!apiKey) throw new NotFoundError("legacy secret");
    return { apiKey };
  });

  app.delete("/api/knowledge/embedding-config/legacy-secret", async (_request, reply) => {
    embeddingConfigController?.clearLegacySecret();
    return reply.code(204).send();
  });

  app.put<{ Body: EmbeddingConfigBody }>(
    "/api/knowledge/embedding-config",
    { schema: { body: EmbeddingConfigBodySchema } },
    async (request) => {
      if (!embeddingConfigController) throw new ServiceUnavailableError("embedding config unavailable");
      const body = request.body;
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
        model: body.model ?? current.model,
        apiKeySource: body.apiKeySource ?? current.apiKeySource
      };
      embeddingConfigController.set(next);
      // model change → mark stale so chunks re-embed with the new model
      if (next.model && next.model !== current.model) {
        service?.markStale(next.model);
      }
      await service?.drainEmbeddings();
      return { ok: true };
    }
  );

  // ── File mirror (hybrid SQLite + Markdown/JSONL) ──
  app.get("/api/knowledge/root-path", async () => ({ path: rootPath }));

  app.put<{ Body: RootPathBody }>(
    "/api/knowledge/root-path",
    { schema: { body: RootPathBodySchema } },
    async (request) => {
      rootPath = (request.body.path ?? "").trim();
      rootPathController?.set(rootPath);
      return { path: rootPath };
    }
  );

  app.post<{ Body: MirrorPathBody }>(
    "/api/knowledge/mirror/export",
    { schema: { body: MirrorPathBodySchema } },
    async (request) => {
      const kw = requireStore();
      const target = (request.body.path ?? rootPath).trim();
      if (!target) throw new BadRequestError("rootPath not set");
      return await exportToDir(kw, target);
    }
  );

  app.post<{ Body: MirrorPathBody }>(
    "/api/knowledge/mirror/import",
    { schema: { body: MirrorPathBodySchema } },
    async (request) => {
      const kw = requireStore();
      const source = (request.body.path ?? rootPath).trim();
      if (!source) throw new BadRequestError("rootPath not set");
      return await importFromDir(kw, source, {
        noteChanged: (note) => service?.reindexNote(note),
        taskChanged: (task) => service?.reindexTask(task)
      });
    }
  );
}
