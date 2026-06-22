import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, like, asc, inArray, ne, or, isNull, lt, lte } from "drizzle-orm";
import type {
  AiConversation,
  AiMessage,
  AiRetrievalMode,
  FocusSession,
  IndexStatus,
  KnowledgeBoardColumn,
  KnowledgeNote,
  KnowledgeProject,
  KnowledgeSource,
  KnowledgeTask,
  KnowledgeTaskStatus,
  Task,
  WindowSnapshot
} from "@neo-companion/shared";
import {
  aiConversations,
  aiMessages,
  focusSessions,
  knowledgeBoardColumns,
  knowledgeChunks,
  knowledgeNoteTags,
  knowledgeNotes,
  knowledgeProjects,
  knowledgeTags,
  knowledgeTasks,
  embeddingCache,
  tasks,
  windowEvents
} from "./schema";

export * from "./schema";
export * from "./knowledge-fs";

export type NeoDatabase =
  | {
      kind: "sqlite";
      sqlite: Database.Database;
      db: ReturnType<typeof drizzle>;
      close: () => void;
    }
  | {
      kind: "memory";
      tasks: Task[];
      focusSessions: FocusSession[];
      windowEvents: WindowSnapshot[];
      close: () => void;
    };

/**
 * Resolve the default on-disk SQLite path.
 *
 * Priority:
 *   1. `NEO_DB_PATH` (explicit override; can be `:memory:` or any path)
 *   2. OS-standard application data directory:
 *      - Windows: `%APPDATA%\NeoCompanion\neo-companion.sqlite`
 *      - macOS:   `~/Library/Application Support/NeoCompanion/neo-companion.sqlite`
 *      - Linux:   `${XDG_DATA_HOME:-~/.local/share}/NeoCompanion/neo-companion.sqlite`
 *
 * Ensures the parent directory exists so better-sqlite3 can open the file.
 */
export function resolveDefaultDbPath(): string {
  const override = process.env.NEO_DB_PATH;
  if (override && override.length > 0) return override;

  const home = homedir();
  let baseDir: string;
  if (process.platform === "win32") {
    baseDir = process.env.APPDATA ?? join(home, "AppData", "Roaming");
  } else if (process.platform === "darwin") {
    baseDir = join(home, "Library", "Application Support");
  } else {
    baseDir = process.env.XDG_DATA_HOME ?? join(home, ".local", "share");
  }

  const appDir = join(baseDir, "NeoCompanion");
  mkdirSync(appDir, { recursive: true });
  return join(appDir, "neo-companion.sqlite");
}

export function createDatabase(filename = resolveDefaultDbPath()) {
  try {
    const sqlite = new Database(filename);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite);
    initSchema(sqlite);

    return {
      kind: "sqlite" as const,
      sqlite,
      db,
      close: () => sqlite.close()
    };
  } catch (error) {
    if (process.env.NEO_DB_STRICT === "1") {
      throw error;
    }
    return {
      kind: "memory" as const,
      tasks: [],
      focusSessions: [],
      windowEvents: [],
      close: () => {}
    };
  }
}

/** True when the better-sqlite3 native binding loads (sqlite path reachable). */
export function isSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch {
    return false;
  }
}

export function initSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_minutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS window_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      process_name TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      dwell_seconds INTEGER NOT NULL,
      classification TEXT NOT NULL
    );

    -- Knowledge Workspace (v2)
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      color TEXT,
      icon TEXT,
      is_inbox INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS board_columns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      "order" INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      column_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      "order" INTEGER NOT NULL DEFAULT 0,
      linked_note_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding_model TEXT,
      embedding_dimensions INTEGER,
      index_status TEXT NOT NULL DEFAULT 'pending',
      index_error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      updated_at TEXT NOT NULL
    );

    -- FTS5 mirror of chunk content for full-text search (works without sqlite-vec).
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      content,
      project_id UNINDEXED,
      source_type UNINDEXED,
      source_id UNINDEXED,
      content_hash UNINDEXED,
      tokenize = 'trigram'
    );

    -- Embedding cache (Phase 3): same content_hash → reuse stored vector.
    CREATE TABLE IF NOT EXISTS embedding_cache (
      content_hash TEXT NOT NULL,
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      PRIMARY KEY (content_hash, model)
    );

    -- AI conversations (Phase 4), separate from v1 pet conversations.
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hook_always_rules (
      agent_id TEXT NOT NULL,
      command_prefix TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (agent_id, command_prefix)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  runSchemaMigrations(sqlite);
}

function runSchemaMigrations(sqlite: Database.Database): void {
  const applied = new Set((sqlite.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((r) => r.version));
  const apply = (version: number, migrate: () => void) => {
    if (applied.has(version)) return;
    sqlite.transaction(() => {
      migrate();
      sqlite.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
    })();
  };

  apply(1, () => {
    const columns = sqlite.prepare("PRAGMA table_info(embedding_cache)").all() as Array<{ name: string; pk: number }>;
    const composite = columns.filter((c) => c.pk > 0).length === 2;
    if (!composite) {
      sqlite.exec(`
        CREATE TABLE embedding_cache_v2 (
          content_hash TEXT NOT NULL,
          embedding BLOB NOT NULL,
          model TEXT NOT NULL,
          dimensions INTEGER NOT NULL,
          PRIMARY KEY (content_hash, model)
        );
        INSERT OR REPLACE INTO embedding_cache_v2 SELECT content_hash, embedding, model, dimensions FROM embedding_cache;
        DROP TABLE embedding_cache;
        ALTER TABLE embedding_cache_v2 RENAME TO embedding_cache;
      `);
    }
  });
  apply(2, () => {
    const names = new Set((sqlite.prepare("PRAGMA table_info(knowledge_chunks)").all() as Array<{ name: string }>).map((c) => c.name));
    if (!names.has("retry_count")) sqlite.exec("ALTER TABLE knowledge_chunks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
    if (!names.has("next_retry_at")) sqlite.exec("ALTER TABLE knowledge_chunks ADD COLUMN next_retry_at TEXT");
  });
  apply(3, () => {
    const sql = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'knowledge_chunks_fts'").get() as { sql?: string } | undefined)?.sql ?? "";
    if (!/chunk_id/i.test(sql)) {
      sqlite.exec(`
        DROP TABLE IF EXISTS knowledge_chunks_fts;
        CREATE VIRTUAL TABLE knowledge_chunks_fts USING fts5(
          chunk_id UNINDEXED,
          content,
          project_id UNINDEXED,
          source_type UNINDEXED,
          source_id UNINDEXED,
          content_hash UNINDEXED,
          tokenize = 'trigram'
        );
        INSERT INTO knowledge_chunks_fts (chunk_id, content, project_id, source_type, source_id, content_hash)
          SELECT id, content, project_id, source_type, source_id, content_hash FROM knowledge_chunks;
      `);
    }
  });
  // v4: indexes for hot query paths. All CREATE INDEX IF NOT EXISTS so reruns
  // are no-ops. Covers the WHERE/ORDER BY columns used by stores in this file.
  apply(4, () => {
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON projects(parent_id);
      CREATE INDEX IF NOT EXISTS idx_projects_is_inbox ON projects(is_inbox);
      CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
      CREATE INDEX IF NOT EXISTS idx_note_tags_note_id ON note_tags(note_id);
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_board_columns_project_id ON board_columns(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_tasks_project_id ON knowledge_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_tasks_column_id ON knowledge_tasks(column_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_tasks_project_column ON knowledge_tasks(project_id, column_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_project_id ON knowledge_chunks(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_index_status ON knowledge_chunks(index_status);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_retry ON knowledge_chunks(index_status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_project ON ai_conversations(project_id);
      CREATE INDEX IF NOT EXISTS idx_focus_sessions_task_id ON focus_sessions(task_id);
      CREATE INDEX IF NOT EXISTS idx_focus_sessions_status ON focus_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_window_events_captured_at ON window_events(captured_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    `);
  });
  // v5: hook_always_rules table for hook permission persistence (survives restart).
  apply(5, () => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS hook_always_rules (
        agent_id TEXT NOT NULL,
        command_prefix TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (agent_id, command_prefix)
      );
    `);
  });
}

/** Read a single app_config value (JSON string), or null when absent. */
export function getAppConfig(database: NeoDatabase, key: string): string | null {
  if (database.kind !== "sqlite") return null;
  const row = database.sqlite.prepare("SELECT value FROM app_config WHERE key = ?").get(key) as { value?: string } | undefined;
  return row?.value ?? null;
}

/** Write (upsert) a single app_config value. No-op on the memory fallback. */
export function setAppConfig(database: NeoDatabase, key: string, value: string): void {
  if (database.kind !== "sqlite") return;
  database.sqlite
    .prepare("INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(key, value, new Date().toISOString());
}

/**
 * Hook permission "always-allow" rules store. Survives sidecar restarts.
 * On the memory fallback (no native sqlite) returns an in-memory shim so the
 * hook manager stays consistent — rules just won't persist across restarts.
 */
export interface HookRulesStore {
  list(): Array<{ agentId: string; commandPrefix: string; createdAt: number }>;
  add(agentId: string, commandPrefix: string, createdAt: number): void;
  remove(agentId: string, commandPrefix: string): void;
}

export function createHookRulesStore(database: NeoDatabase): HookRulesStore {
  if (database.kind !== "sqlite") {
    const rules: Array<{ agentId: string; commandPrefix: string; createdAt: number }> = [];
    return {
      list: () => [...rules],
      add: (agentId, commandPrefix, createdAt) => {
        if (rules.some((r) => r.agentId === agentId && r.commandPrefix === commandPrefix)) return;
        rules.push({ agentId, commandPrefix, createdAt });
      },
      remove: (agentId, commandPrefix) => {
        const idx = rules.findIndex((r) => r.agentId === agentId && r.commandPrefix === commandPrefix);
        if (idx !== -1) rules.splice(idx, 1);
      }
    };
  }
  const sqlite = database.sqlite;
  return {
    list: () => {
      const rows = sqlite.prepare("SELECT agent_id, command_prefix, created_at FROM hook_always_rules").all() as Array<{ agent_id: string; command_prefix: string; created_at: number }>;
      return rows.map((r) => ({ agentId: r.agent_id, commandPrefix: r.command_prefix, createdAt: r.created_at }));
    },
    add: (agentId, commandPrefix, createdAt) => {
      sqlite
        .prepare("INSERT OR IGNORE INTO hook_always_rules (agent_id, command_prefix, created_at) VALUES (?, ?, ?)")
        .run(agentId, commandPrefix, createdAt);
    },
    remove: (agentId, commandPrefix) => {
      sqlite
        .prepare("DELETE FROM hook_always_rules WHERE agent_id = ? AND command_prefix = ?")
        .run(agentId, commandPrefix);
    }
  };
}

/** Load the sqlite-vec extension into a connection. Never throws; returns loaded state + error reason. */
export function loadVecExtension(database: NeoDatabase): { loaded: boolean; version?: string; error?: string } {
  if (database.kind !== "sqlite") return { loaded: false, error: "memory database (no native sqlite)" };
  try {
    sqliteVec.load(database.sqlite);
    const row = database.sqlite.prepare("SELECT vec_version() AS v").get() as { v?: string } | undefined;
    return { loaded: true, version: row?.v };
  } catch (e) {
    return { loaded: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Serialize a vector for better-sqlite3 BLOB binding (Float32 little-endian). */
export function toVecBuffer(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

/** Deserialize a stored BLOB back to a number[]. */
function bufferToVec(buf: Buffer | Uint8Array): number[] {
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

export function createTaskStore(database: NeoDatabase) {
  if (database.kind === "memory") {
    return {
      list(opts?: { limit?: number; offset?: number }): { items: Task[]; total: number } {
        const sorted = [...database.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const total = sorted.length;
        const offset = opts?.offset ?? 0;
        const limit = opts?.limit ?? sorted.length;
        return { items: sorted.slice(offset, offset + limit), total };
      },
      create(title: string): Task {
        const task = createTaskValue(title);
        database.tasks.push(task);
        return task;
      },
      patch(id: string, patch: Partial<Pick<Task, "title" | "status">>): Task | null {
        const index = database.tasks.findIndex((task) => task.id === id);
        if (index === -1) return null;

        const existing = database.tasks[index];
        const next = patchTaskValue(existing, patch);
        database.tasks[index] = next;
        return next;
      }
    };
  }

  const { db } = database;

  return {
    list(opts?: { limit?: number; offset?: number }): { items: Task[]; total: number } {
      const all = db.select().from(tasks).orderBy(tasks.createdAt).all().map(rowToTask);
      const total = all.length;
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? all.length;
      return { items: all.slice(offset, offset + limit), total };
    },
    create(title: string): Task {
      const task = createTaskValue(title);
      db.insert(tasks).values(toTaskRow(task)).run();
      return task;
    },
    patch(id: string, patch: Partial<Pick<Task, "title" | "status">>): Task | null {
      const existing = db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) return null;

      const next = patchTaskValue(rowToTask(existing), patch);
      db.update(tasks).set(toTaskRow(next)).where(eq(tasks.id, id)).run();
      return next;
    }
  };
}

export function createFocusStore(database: NeoDatabase) {
  if (database.kind === "memory") {
    return {
      create(taskId: string | null, durationMinutes: number): FocusSession {
        const session = createFocusValue(taskId, durationMinutes);
        database.focusSessions.push(session);
        return session;
      },
      updateStatus(id: string, status: FocusSession["status"]): FocusSession | null {
        const index = database.focusSessions.findIndex((session) => session.id === id);
        if (index === -1) return null;
        const next = patchFocusStatus(database.focusSessions[index], status);
        database.focusSessions[index] = next;
        return next;
      },
      get(id: string): FocusSession | null {
        return database.focusSessions.find((session) => session.id === id) ?? null;
      }
    };
  }

  const { db } = database;

  return {
    create(taskId: string | null, durationMinutes: number): FocusSession {
      const session = createFocusValue(taskId, durationMinutes);
      db.insert(focusSessions).values(toFocusRow(session)).run();
      return session;
    },
    updateStatus(id: string, status: FocusSession["status"]): FocusSession | null {
      const existing = db.select().from(focusSessions).where(eq(focusSessions.id, id)).get();
      if (!existing) return null;

      const next = patchFocusStatus(rowToFocus(existing), status);
      db.update(focusSessions).set(toFocusRow(next)).where(eq(focusSessions.id, id)).run();
      return next;
    },
    get(id: string): FocusSession | null {
      const existing = db.select().from(focusSessions).where(eq(focusSessions.id, id)).get();
      return existing ? rowToFocus(existing) : null;
    }
  };
}

export function createWindowEventStore(database: NeoDatabase) {
  if (database.kind === "memory") {
    return {
      create(snapshot: WindowSnapshot): WindowSnapshot {
        database.windowEvents.push(snapshot);
        return snapshot;
      },
      latest(limit = 20): WindowSnapshot[] {
        return [...database.windowEvents]
          .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
          .slice(0, limit);
      }
    };
  }

  const { db } = database;

  return {
    create(snapshot: WindowSnapshot): WindowSnapshot {
      db.insert(windowEvents)
        .values({
          id: crypto.randomUUID(),
          title: snapshot.title,
          processName: snapshot.processName,
          capturedAt: snapshot.capturedAt,
          dwellSeconds: snapshot.dwellSeconds,
          classification: snapshot.classification
        })
        .run();
      return snapshot;
    },
    latest(limit = 20): WindowSnapshot[] {
      return db.select().from(windowEvents).orderBy(windowEvents.capturedAt).limit(limit).all().map((row) => ({
        title: row.title,
        processName: row.processName,
        capturedAt: row.capturedAt,
        dwellSeconds: row.dwellSeconds,
        classification: row.classification
      }));
    }
  };
}

function createTaskValue(title: string): Task {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    status: "open",
    createdAt: new Date().toISOString(),
    completedAt: null
  };
}

function patchTaskValue(existing: Task, patch: Partial<Pick<Task, "title" | "status">>): Task {
  const now = new Date().toISOString();
  return {
    ...existing,
    title: patch.title?.trim() || existing.title,
    status: patch.status ?? existing.status,
    completedAt: patch.status === "done" ? now : patch.status === "open" ? null : existing.completedAt
  };
}

function createFocusValue(taskId: string | null, durationMinutes: number): FocusSession {
  return {
    id: crypto.randomUUID(),
    taskId,
    status: "active",
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMinutes
  };
}

function patchFocusStatus(existing: FocusSession, status: FocusSession["status"]): FocusSession {
  return {
    ...existing,
    status,
    completedAt: status === "active" ? null : new Date().toISOString()
  };
}

function rowToTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt
  };
}

function toTaskRow(task: Task): typeof tasks.$inferInsert {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt,
    completedAt: task.completedAt
  };
}

function rowToFocus(row: typeof focusSessions.$inferSelect): FocusSession {
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMinutes: row.durationMinutes
  };
}

function toFocusRow(session: FocusSession): typeof focusSessions.$inferInsert {
  return {
    id: session.id,
    taskId: session.taskId,
    status: session.status,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    durationMinutes: session.durationMinutes
  };
}

// ── Knowledge Workspace store ──
// Sync CRUD over better-sqlite3. Timestamps are stored as ISO TEXT and mapped
// to epoch-ms numbers to match the frontend mock contract. Tags are synced via
// the note_tags join on note write. The memory fallback is not supported for
// knowledge (tests use the sqlite :memory: path, which goes through the sqlite
// branch) — memory callers get an explicit error.

export interface KnowledgeStore {
  runInTransaction<T>(operation: () => T): T;
  // Projects
  listProjects(): KnowledgeProject[];
  getProject(id: string): KnowledgeProject | null;
  childProjects(parentId: string): KnowledgeProject[];
  projectPath(id: string): KnowledgeProject[];
  createProject(input: { title: string; parentId?: string | null; description?: string; color?: string; icon?: string; isInbox?: boolean; order?: number }): KnowledgeProject;
  upsertImportedProject(project: KnowledgeProject): void;
  updateProject(id: string, patch: Partial<Pick<KnowledgeProject, "title" | "description" | "color" | "icon" | "parentId" | "order">>): KnowledgeProject | null;
  deleteProject(id: string): void;
  ensureInbox(): KnowledgeProject;
  // Notes
  notesForProject(projectId: string): KnowledgeNote[];
  getNote(id: string): KnowledgeNote | null;
  createNote(projectId: string, title: string): KnowledgeNote;
  upsertImportedNote(note: KnowledgeNote): void;
  updateNote(id: string, patch: Partial<Pick<KnowledgeNote, "title" | "body" | "tags">>): KnowledgeNote | null;
  deleteNote(id: string): void;
  backlinksFor(targetId: string): { sourceType: "note" | "task"; sourceId: string }[];
  // Board columns
  columnsForProject(projectId: string): KnowledgeBoardColumn[];
  createColumn(projectId: string, input: { title: string; status: KnowledgeTaskStatus; order: number }): KnowledgeBoardColumn;
  upsertImportedColumn(column: KnowledgeBoardColumn): void;
  updateColumn(id: string, patch: Partial<Pick<KnowledgeBoardColumn, "title" | "status" | "order">>): KnowledgeBoardColumn | null;
  deleteColumn(id: string): void;
  // Tasks
  tasksForProject(projectId: string): KnowledgeTask[];
  createTask(projectId: string, columnId: string, title: string): KnowledgeTask;
  upsertImportedTask(task: KnowledgeTask): void;
  updateTask(id: string, patch: { title?: string; description?: string; status?: KnowledgeTaskStatus; columnId?: string; order?: number; linkedNoteId?: string | null }): KnowledgeTask | null;
  deleteTask(id: string): void;
  moveTask(taskId: string, targetColumnId: string, targetIndex: number): void;
  // Indexing (Phase 2). `chunk` is injected so the db package stays free of
  // server-local's chunker dependency.
  reindexNote(note: KnowledgeNote, chunk: (text: string) => { content: string; contentHash: string }[]): void;
  reindexTask(task: KnowledgeTask, chunk: (text: string) => { content: string; contentHash: string }[]): void;
  removeIndex(sourceType: "note" | "task", sourceId: string): void;
  searchFts(projectId: string | null, query: string, limit: number): KnowledgeSource[];
  getChunkContents(chunkIds: string[]): Map<string, string>;
  markStale(embeddingModel?: string): void;
  getIndexStatus(providerConfigured: boolean): IndexStatus;
  // Vector indexing (Phase 3). vecLoaded reflects whether sqlite-vec loaded.
  vecLoaded: boolean;
  ensureVecTable(dim: number): boolean;
  searchKnn(queryVec: number[], k: number, projectId: string | null): KnowledgeSource[];
  putVecChunk(chunkId: string, projectId: string, vec: number[]): void;
  delVecChunk(chunkId: string): void;
  getCachedEmbedding(contentHash: string, model: string): { vector: number[]; dimensions: number } | null;
  putCachedEmbedding(contentHash: string, vec: number[], model: string, dim: number): void;
  listPendingChunks(limit: number): Array<{
    id: string; content: string; contentHash: string; projectId: string; sourceType: "note" | "task"; sourceId: string;
  }>;
  markChunkIndexed(chunkId: string, model: string, dim: number): void;
  markChunkFailed(chunkId: string, error: string): void;
}

function isoToMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function createKnowledgeStore(database: NeoDatabase): KnowledgeStore {
  if (database.kind !== "sqlite") {
    throw new Error("Knowledge store requires a sqlite database (memory fallback unsupported)");
  }
  const { db, sqlite } = database;
  const vecState = loadVecExtension(database);
  let vecLoaded = vecState.loaded;
  const vecVersion = vecState.version;
  const vecLoadError = vecState.error;
  let vecDim: number | null = null;
  if (vecLoaded) {
    const existingSql = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'knowledge_chunks_vec'").get() as { sql?: string } | undefined)?.sql;
    if (existingSql) {
      const existingDim = Number(existingSql.match(/FLOAT\[(\d+)\]/i)?.[1]);
      const hasPartition = /project_id\s+TEXT\s+PARTITION\s+KEY/i.test(existingSql);
      if (Number.isFinite(existingDim) && hasPartition) {
        vecDim = existingDim;
      } else {
        sqlite.exec("DROP TABLE knowledge_chunks_vec");
        sqlite.prepare("UPDATE knowledge_chunks SET index_status = 'stale' WHERE index_status = 'indexed'").run();
      }
    }
  }

  function runInTransaction<T>(operation: () => T): T {
    return sqlite.transaction(operation)();
  }

  // ── tags helpers ──
  function ensureTagIds(names: string[]): string[] {
    const ids: string[] = [];
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const existing = db.select().from(knowledgeTags).where(eq(knowledgeTags.name, trimmed)).get();
      if (existing) {
        ids.push(existing.id);
      } else {
        const id = crypto.randomUUID();
        db.insert(knowledgeTags).values({ id, name: trimmed }).run();
        ids.push(id);
      }
    }
    return ids;
  }

  function loadNoteTags(noteId: string): string[] {
    const rows = db
      .select({ name: knowledgeTags.name })
      .from(knowledgeNoteTags)
      .innerJoin(knowledgeTags, eq(knowledgeNoteTags.tagId, knowledgeTags.id))
      .where(eq(knowledgeNoteTags.noteId, noteId))
      .all();
    return rows.map((r) => r.name);
  }

  function syncNoteTags(noteId: string, tags: string[]): void {
    db.delete(knowledgeNoteTags).where(eq(knowledgeNoteTags.noteId, noteId)).run();
    const ids = ensureTagIds(tags);
    if (ids.length) {
      db.insert(knowledgeNoteTags).values(ids.map((tagId) => ({ noteId, tagId }))).run();
    }
  }

  // ── mappers ──
  function rowToProject(row: typeof knowledgeProjects.$inferSelect): KnowledgeProject {
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      parentId: row.parentId,
      color: row.color ?? undefined,
      icon: row.icon ?? undefined,
      isInbox: row.isInbox,
      order: row.order,
      createdAt: isoToMs(row.createdAt),
      updatedAt: isoToMs(row.updatedAt)
    };
  }

  function rowToNote(row: typeof knowledgeNotes.$inferSelect): KnowledgeNote {
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      body: row.body,
      tags: loadNoteTags(row.id),
      createdAt: isoToMs(row.createdAt),
      updatedAt: isoToMs(row.updatedAt)
    };
  }

  function rowToColumn(row: typeof knowledgeBoardColumns.$inferSelect): KnowledgeBoardColumn {
    return {
      id: row.id,
      projectId: row.projectId,
      title: row.title,
      status: row.status,
      order: row.order
    };
  }

  function rowToTask(row: typeof knowledgeTasks.$inferSelect): KnowledgeTask {
    return {
      id: row.id,
      projectId: row.projectId,
      columnId: row.columnId ?? "",
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      order: row.order,
      linkedNoteId: row.linkedNoteId ?? undefined,
      tags: [],
      createdAt: isoToMs(row.createdAt),
      updatedAt: isoToMs(row.updatedAt)
    };
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  // ── projects ──
  function listProjects(): KnowledgeProject[] {
    return db.select().from(knowledgeProjects).orderBy(asc(knowledgeProjects.order)).all().map(rowToProject);
  }
  function getProject(id: string): KnowledgeProject | null {
    const row = db.select().from(knowledgeProjects).where(eq(knowledgeProjects.id, id)).get();
    return row ? rowToProject(row) : null;
  }
  function childProjects(parentId: string): KnowledgeProject[] {
    return db.select().from(knowledgeProjects).where(eq(knowledgeProjects.parentId, parentId)).orderBy(asc(knowledgeProjects.order)).all().map(rowToProject);
  }
  function projectPath(id: string): KnowledgeProject[] {
    const path: KnowledgeProject[] = [];
    let current = getProject(id);
    let guard = 0;
    while (current && guard < 32) {
      path.unshift(current);
      current = current.parentId ? getProject(current.parentId) : null;
      guard += 1;
    }
    return path;
  }
  function createProject(input: { title: string; parentId?: string | null; description?: string; color?: string; icon?: string; isInbox?: boolean; order?: number }): KnowledgeProject {
    const id = crypto.randomUUID();
    const ts = nowIso();
    db.insert(knowledgeProjects).values({
      id,
      title: input.title.trim(),
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      isInbox: input.isInbox ?? false,
      order: input.order ?? 0,
      createdAt: ts,
      updatedAt: ts
    }).run();
    return getProject(id)!;
  }
  function upsertImportedProject(project: KnowledgeProject): void {
    db.insert(knowledgeProjects).values({
      id: project.id, title: project.title, description: project.description ?? null,
      parentId: project.parentId, color: project.color ?? null, icon: project.icon ?? null,
      isInbox: project.isInbox ?? false, order: project.order,
      createdAt: new Date(project.createdAt).toISOString(), updatedAt: new Date(project.updatedAt).toISOString()
    }).onConflictDoUpdate({ target: knowledgeProjects.id, set: {
      title: project.title, description: project.description ?? null, parentId: project.parentId,
      color: project.color ?? null, icon: project.icon ?? null, isInbox: project.isInbox ?? false,
      order: project.order, updatedAt: new Date(project.updatedAt).toISOString()
    }}).run();
  }
  function updateProject(id: string, patch: Partial<Pick<KnowledgeProject, "title" | "description" | "color" | "icon" | "parentId" | "order">>): KnowledgeProject | null {
    const existing = db.select().from(knowledgeProjects).where(eq(knowledgeProjects.id, id)).get();
    if (!existing) return null;
    db.update(knowledgeProjects).set({
      title: patch.title?.trim() ?? existing.title,
      description: patch.description !== undefined ? patch.description : existing.description,
      color: patch.color !== undefined ? patch.color : existing.color,
      icon: patch.icon !== undefined ? patch.icon : existing.icon,
      parentId: patch.parentId !== undefined ? patch.parentId : existing.parentId,
      order: patch.order ?? existing.order,
      updatedAt: nowIso()
    }).where(eq(knowledgeProjects.id, id)).run();
    return getProject(id);
  }
  function deleteProject(id: string): void {
    sqlite.transaction(() => {
      const projectIds: string[] = [];
      const visited = new Set<string>();
      const collect = (projectId: string) => {
        if (visited.has(projectId)) return;
        visited.add(projectId);
        for (const child of childProjects(projectId)) collect(child.id);
        projectIds.push(projectId);
      };
      collect(id);
      for (const projectId of projectIds) {
        for (const note of notesForProject(projectId)) {
          removeIndex("note", note.id);
          db.delete(knowledgeNoteTags).where(eq(knowledgeNoteTags.noteId, note.id)).run();
        }
        for (const task of tasksForProject(projectId)) removeIndex("task", task.id);
        db.delete(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId)).run();
        db.delete(knowledgeBoardColumns).where(eq(knowledgeBoardColumns.projectId, projectId)).run();
        db.delete(knowledgeTasks).where(eq(knowledgeTasks.projectId, projectId)).run();
        db.delete(knowledgeProjects).where(eq(knowledgeProjects.id, projectId)).run();
      }
    })();
  }
  function ensureInbox(): KnowledgeProject {
    const existing = db.select().from(knowledgeProjects).where(eq(knowledgeProjects.isInbox, true)).get();
    if (existing) return rowToProject(existing);
    return createProject({ title: "收件箱", description: "临时想法与未分类内容", color: "#6b7280", isInbox: true, order: 0 });
  }

  // ── notes ──
  function notesForProject(projectId: string): KnowledgeNote[] {
    return db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId)).orderBy(asc(knowledgeNotes.updatedAt)).all().map(rowToNote);
  }
  function getNote(id: string): KnowledgeNote | null {
    const row = db.select().from(knowledgeNotes).where(eq(knowledgeNotes.id, id)).get();
    return row ? rowToNote(row) : null;
  }
  function createNote(projectId: string, title: string): KnowledgeNote {
    const id = crypto.randomUUID();
    const ts = nowIso();
    db.insert(knowledgeNotes).values({
      id,
      projectId,
      title: title.trim() || "无标题笔记",
      body: "",
      createdAt: ts,
      updatedAt: ts
    }).run();
    return getNote(id)!;
  }
  function upsertImportedNote(note: KnowledgeNote): void {
    db.insert(knowledgeNotes).values({
      id: note.id, projectId: note.projectId, title: note.title, body: note.body,
      createdAt: new Date(note.createdAt).toISOString(), updatedAt: new Date(note.updatedAt).toISOString()
    }).onConflictDoUpdate({ target: knowledgeNotes.id, set: {
      projectId: note.projectId, title: note.title, body: note.body,
      updatedAt: new Date(note.updatedAt).toISOString()
    }}).run();
    syncNoteTags(note.id, note.tags);
  }
  function updateNote(id: string, patch: Partial<Pick<KnowledgeNote, "title" | "body" | "tags">>): KnowledgeNote | null {
    const existing = db.select().from(knowledgeNotes).where(eq(knowledgeNotes.id, id)).get();
    if (!existing) return null;
    db.update(knowledgeNotes).set({
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      body: patch.body !== undefined ? patch.body : existing.body,
      updatedAt: nowIso()
    }).where(eq(knowledgeNotes.id, id)).run();
    if (patch.tags !== undefined) syncNoteTags(id, patch.tags);
    return getNote(id);
  }
  function deleteNote(id: string): void {
    sqlite.transaction(() => {
      removeIndex("note", id);
      db.delete(knowledgeNoteTags).where(eq(knowledgeNoteTags.noteId, id)).run();
      db.delete(knowledgeNotes).where(eq(knowledgeNotes.id, id)).run();
    })();
  }
  function backlinksFor(targetId: string): { sourceType: "note" | "task"; sourceId: string }[] {
    // Basic [[target]] scan; upgraded to FTS in Phase 2.
    const pattern = `%[[${targetId}]%`;
    const notes = db
      .select({ id: knowledgeNotes.id })
      .from(knowledgeNotes)
      .where(like(knowledgeNotes.body, pattern))
      .all()
      .map((r) => ({ sourceType: "note" as const, sourceId: r.id }));
    return notes;
  }

  // ── columns ──
  function columnsForProject(projectId: string): KnowledgeBoardColumn[] {
    return db.select().from(knowledgeBoardColumns).where(eq(knowledgeBoardColumns.projectId, projectId)).orderBy(asc(knowledgeBoardColumns.order)).all().map(rowToColumn);
  }
  function createColumn(projectId: string, input: { title: string; status: KnowledgeTaskStatus; order: number }): KnowledgeBoardColumn {
    const id = crypto.randomUUID();
    db.insert(knowledgeBoardColumns).values({ id, projectId, title: input.title.trim(), status: input.status, order: input.order }).run();
    const row = db.select().from(knowledgeBoardColumns).where(eq(knowledgeBoardColumns.id, id)).get();
    return rowToColumn(row!);
  }
  function upsertImportedColumn(column: KnowledgeBoardColumn): void {
    db.insert(knowledgeBoardColumns).values({
      id: column.id, projectId: column.projectId, title: column.title,
      status: column.status, order: column.order
    }).onConflictDoUpdate({ target: knowledgeBoardColumns.id, set: {
      projectId: column.projectId, title: column.title, status: column.status, order: column.order
    }}).run();
  }
  function updateColumn(id: string, patch: Partial<Pick<KnowledgeBoardColumn, "title" | "status" | "order">>): KnowledgeBoardColumn | null {
    const existing = db.select().from(knowledgeBoardColumns).where(eq(knowledgeBoardColumns.id, id)).get();
    if (!existing) return null;
    db.update(knowledgeBoardColumns).set({
      title: patch.title?.trim() ?? existing.title,
      status: patch.status ?? existing.status,
      order: patch.order ?? existing.order
    }).where(eq(knowledgeBoardColumns.id, id)).run();
    const row = db.select().from(knowledgeBoardColumns).where(eq(knowledgeBoardColumns.id, id)).get();
    return row ? rowToColumn(row) : null;
  }
  function deleteColumn(id: string): void {
    // unhook tasks in this column rather than deleting them
    db.update(knowledgeTasks).set({ columnId: null }).where(eq(knowledgeTasks.columnId, id)).run();
    db.delete(knowledgeBoardColumns).where(eq(knowledgeBoardColumns.id, id)).run();
  }

  // ── tasks ──
  function tasksForProject(projectId: string): KnowledgeTask[] {
    return db.select().from(knowledgeTasks).where(eq(knowledgeTasks.projectId, projectId)).orderBy(asc(knowledgeTasks.order)).all().map(rowToTask);
  }
  function createTask(projectId: string, columnId: string, title: string): KnowledgeTask {
    const id = crypto.randomUUID();
    const ts = nowIso();
    db.insert(knowledgeTasks).values({
      id,
      projectId,
      columnId: columnId || null,
      title: title.trim(),
      status: "todo",
      order: 0,
      linkedNoteId: null,
      createdAt: ts,
      updatedAt: ts
    }).run();
    return rowToTask(db.select().from(knowledgeTasks).where(eq(knowledgeTasks.id, id)).get()!);
  }
  function upsertImportedTask(task: KnowledgeTask): void {
    db.insert(knowledgeTasks).values({
      id: task.id, projectId: task.projectId, columnId: task.columnId || null,
      title: task.title, description: task.description ?? null, status: task.status,
      order: task.order, linkedNoteId: task.linkedNoteId ?? null,
      createdAt: new Date(task.createdAt).toISOString(), updatedAt: new Date(task.updatedAt).toISOString()
    }).onConflictDoUpdate({ target: knowledgeTasks.id, set: {
      projectId: task.projectId, columnId: task.columnId || null, title: task.title,
      description: task.description ?? null, status: task.status, order: task.order,
      linkedNoteId: task.linkedNoteId ?? null, updatedAt: new Date(task.updatedAt).toISOString()
    }}).run();
  }
  function updateTask(id: string, patch: { title?: string; description?: string; status?: KnowledgeTaskStatus; columnId?: string; order?: number; linkedNoteId?: string | null }): KnowledgeTask | null {
    const existing = db.select().from(knowledgeTasks).where(eq(knowledgeTasks.id, id)).get();
    if (!existing) return null;
    db.update(knowledgeTasks).set({
      title: patch.title !== undefined ? patch.title.trim() : existing.title,
      description: patch.description !== undefined ? patch.description : existing.description,
      status: patch.status ?? existing.status,
      columnId: patch.columnId !== undefined ? (patch.columnId || null) : existing.columnId,
      order: patch.order ?? existing.order,
      linkedNoteId: patch.linkedNoteId !== undefined ? patch.linkedNoteId : existing.linkedNoteId,
      updatedAt: nowIso()
    }).where(eq(knowledgeTasks.id, id)).run();
    const row = db.select().from(knowledgeTasks).where(eq(knowledgeTasks.id, id)).get();
    return row ? rowToTask(row) : null;
  }
  function deleteTask(id: string): void {
    sqlite.transaction(() => {
      removeIndex("task", id);
      db.delete(knowledgeTasks).where(eq(knowledgeTasks.id, id)).run();
    })();
  }
  function moveTask(taskId: string, targetColumnId: string, targetIndex: number): void {
    const task = db.select().from(knowledgeTasks).where(eq(knowledgeTasks.id, taskId)).get();
    if (!task) return;
    const projectId = task.projectId;
    // shift siblings in target column then place
    const siblings = db.select().from(knowledgeTasks)
      .where(and(eq(knowledgeTasks.projectId, projectId), eq(knowledgeTasks.columnId, targetColumnId)))
      .orderBy(asc(knowledgeTasks.order)).all().filter((t) => t.id !== taskId);
    const clamped = Math.max(0, Math.min(targetIndex, siblings.length));
    siblings.splice(clamped, 0, task);
    siblings.forEach((t, idx) => {
      db.update(knowledgeTasks).set({ columnId: targetColumnId, order: idx }).where(eq(knowledgeTasks.id, t.id)).run();
    });
  }

  // ── indexing (Phase 2): chunk dedup + FTS5 sync ──
  // Re-chunks a note, replacing its existing chunks. content-hash dedup: chunks
  // whose hash already exists for this source are reused (skipping re-embed in
  // Phase 3). FTS5 mirror is written synchronously; embedding stays 'pending'.
  function reindexNote(note: KnowledgeNote, chunk: (text: string) => { content: string; contentHash: string }[]): void {
    const text = note.body ? `${note.title}\n\n${note.body}` : note.title;
    const pieces = chunk(text);
    sqlite.transaction(() => {
      removeIndex("note", note.id);
      const now = nowIso();
      pieces.forEach((piece, ordinal) => {
        const chunkId = crypto.randomUUID();
        db.insert(knowledgeChunks).values({
          id: chunkId, projectId: note.projectId, sourceType: "note", sourceId: note.id,
          ordinal, content: piece.content, contentHash: piece.contentHash,
          embeddingModel: null, embeddingDimensions: null, indexStatus: "pending",
          indexError: null, retryCount: 0, nextRetryAt: null, updatedAt: now
        }).run();
        sqlite.prepare(`INSERT INTO knowledge_chunks_fts
          (chunk_id, content, project_id, source_type, source_id, content_hash) VALUES (?, ?, ?, 'note', ?, ?)`)
          .run(chunkId, piece.content, note.projectId, note.id, piece.contentHash);
      });
    })();
  }

  function reindexTask(task: KnowledgeTask, chunk: (text: string) => { content: string; contentHash: string }[]): void {
    const text = task.description ? `${task.title}\n\n${task.description}` : task.title;
    const pieces = chunk(text);
    sqlite.transaction(() => {
      removeIndex("task", task.id);
      const now = nowIso();
      pieces.forEach((piece, ordinal) => {
        const chunkId = crypto.randomUUID();
        db.insert(knowledgeChunks).values({
          id: chunkId, projectId: task.projectId, sourceType: "task", sourceId: task.id,
          ordinal, content: piece.content, contentHash: piece.contentHash,
          embeddingModel: null, embeddingDimensions: null, indexStatus: "pending",
          indexError: null, retryCount: 0, nextRetryAt: null, updatedAt: now
        }).run();
        sqlite.prepare(`INSERT INTO knowledge_chunks_fts
          (chunk_id, content, project_id, source_type, source_id, content_hash) VALUES (?, ?, ?, 'task', ?, ?)`)
          .run(chunkId, piece.content, task.projectId, task.id, piece.contentHash);
      });
    })();
  }

  function removeIndex(sourceType: "note" | "task", sourceId: string): void {
    // Collect chunk ids so we can also drop their vec0 rows before deleting.
    const chunkIds = db.select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.sourceType, sourceType), eq(knowledgeChunks.sourceId, sourceId)))
      .all().map((r) => r.id);
    for (const cid of chunkIds) delVecChunk(cid);
    // FTS5 delete-then-reinsert: drop matching FTS rows, then the chunk rows.
    sqlite.exec(
      `DELETE FROM knowledge_chunks_fts WHERE source_type = ${sqlStr(sourceType)} AND source_id = ${sqlStr(sourceId)}`
    );
    db.delete(knowledgeChunks)
      .where(and(eq(knowledgeChunks.sourceType, sourceType), eq(knowledgeChunks.sourceId, sourceId)))
      .run();
  }

  function searchFts(projectId: string | null, query: string, limit: number): KnowledgeSource[] {
    // trigram tokenizer indexes 3-grams, so CJK queries shorter than 3 chars
    // (e.g. "向量") won't MATCH reliably. Use FTS5 MATCH for BM25 ranking when
    // the query is long enough, and fall back to a LIKE substring scan for
    // short queries so 2-char Chinese terms still hit.
    const terms = extractTerms(query);
    if (!terms.length) return [];
    const useMatch = terms.every((t) => [...t].length >= 3);
    const cap = Math.max(1, Math.min(limit, 50));
    const projectClause = projectId ? ` AND k.project_id = ${sqlStr(projectId)}` : "";

    let sql: string;
    if (useMatch) {
      const ftsQuery = terms.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
      sql = `SELECT k.chunk_id, k.source_type, k.source_id, k.project_id, k.content,
                bm25(knowledge_chunks_fts) AS rank
         FROM knowledge_chunks_fts k
         WHERE k.content MATCH ${sqlStr(ftsQuery)}${projectClause}
         ORDER BY rank LIMIT ${cap}`;
    } else {
      // LIKE fallback for short CJK terms; rank by position (earlier = better)
      const likeTerms = terms.map((t) => `k.content LIKE ${sqlStr(`%${t.replace(/[%_]/g, "\\$&")}%`)} ESCAPE '\\'`);
      sql = `SELECT k.chunk_id, k.source_type, k.source_id, k.project_id, k.content, 0 AS rank
         FROM knowledge_chunks_fts k
         WHERE (${likeTerms.join(" OR ")})${projectClause}
         LIMIT ${cap}`;
    }
    const rows = sqlite.prepare(sql).all() as Array<{
      chunk_id: string; source_type: "note" | "task"; source_id: string; project_id: string; content: string; rank: number;
    }>;
    // resolve titles + dedup by source (return best chunk per source)
    const bySource = new Map<string, KnowledgeSource>();
    for (const row of rows) {
      const key = `${row.source_type}:${row.source_id}`;
      if (bySource.has(key)) continue;
      const title = resolveSourceTitle(row.source_type, row.source_id);
      bySource.set(key, {
        sourceType: row.source_type,
        sourceId: row.source_id,
        projectId: row.project_id,
        title,
        excerpt: deriveExcerpt(row.content),
        chunkId: row.chunk_id
      });
    }
    return [...bySource.values()];
  }

  function getChunkContents(chunkIds: string[]): Map<string, string> {
    if (!chunkIds.length) return new Map();
    const rows = db.select({ id: knowledgeChunks.id, content: knowledgeChunks.content })
      .from(knowledgeChunks).where(inArray(knowledgeChunks.id, chunkIds)).all();
    return new Map(rows.map((row) => [row.id, row.content]));
  }

  function resolveSourceTitle(sourceType: "note" | "task", sourceId: string): string {
    if (sourceType === "note") {
      const row = db.select().from(knowledgeNotes).where(eq(knowledgeNotes.id, sourceId)).get();
      return row?.title ?? "未命名笔记";
    }
    const row = db.select().from(knowledgeTasks).where(eq(knowledgeTasks.id, sourceId)).get();
    return row?.title ?? "未命名任务";
  }

  function deriveExcerpt(content: string, maxChars = 120): string {
    const flat = content.replace(/[#>*_~`]/g, "").replace(/\s+/g, " ").trim();
    return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1)}…`;
  }

  function markStale(embeddingModel?: string): void {
    // mark indexed chunks stale when the embedding model changes (Phase 3)
    if (embeddingModel) {
      db.update(knowledgeChunks)
        .set({ indexStatus: "stale" })
        .where(and(
          eq(knowledgeChunks.indexStatus, "indexed"),
          or(isNull(knowledgeChunks.embeddingModel), ne(knowledgeChunks.embeddingModel, embeddingModel))
        ))
        .run();
    } else {
      db.update(knowledgeChunks).set({ indexStatus: "stale" }).where(eq(knowledgeChunks.indexStatus, "indexed")).run();
    }
  }

  function getIndexStatus(providerConfigured: boolean): IndexStatus {
    const countBy = (status: string): number => {
      const row = sqlite.prepare(
        `SELECT COUNT(*) AS n FROM knowledge_chunks WHERE index_status = ${sqlStr(status)}`
      ).get() as { n: number } | undefined;
      return row?.n ?? 0;
    };
    const pending = countBy("pending");
    const stale = countBy("stale");
    const retrying = (sqlite.prepare(
      "SELECT COUNT(*) AS n FROM knowledge_chunks WHERE index_status = 'failed' AND retry_count < 3 AND next_retry_at IS NOT NULL"
    ).get() as { n: number }).n;
    const hybridCapable = vecLoaded && providerConfigured;
    const mode: IndexStatus["mode"] = hybridCapable
      ? pending + stale + retrying > 0
        ? "indexing"
        : "hybrid"
      : "fts-only";
    return {
      mode,
      pending,
      failed: countBy("failed"),
      stale,
      retrying,
      providerConfigured,
      vectorExtensionAvailable: vecLoaded,
      vecVersion,
      vecLoadError: vecLoaded ? undefined : vecLoadError
    };
  }

  // ── vector indexing (Phase 3) ──
  function ensureVecTable(dim: number): boolean {
    if (!vecLoaded) return false;
    if (vecDim === null) {
      const existingSql = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE name = 'knowledge_chunks_vec'").get() as { sql?: string } | undefined)?.sql;
      const existingDim = Number(existingSql?.match(/FLOAT\[(\d+)\]/i)?.[1]);
      const hasPartition = /project_id\s+TEXT\s+PARTITION\s+KEY/i.test(existingSql ?? "");
      if (existingSql && (existingDim !== dim || !hasPartition)) {
        sqlite.exec("DROP TABLE knowledge_chunks_vec");
        markStale();
      }
      sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_vec USING vec0(
        chunk_id TEXT PRIMARY KEY,
        project_id TEXT PARTITION KEY,
        embedding FLOAT[${dim}]
      )`);
      vecDim = dim;
    } else if (vecDim !== dim) {
      // dimension changed (model swap) → drop, recreate, force full re-embed
      sqlite.exec("DROP TABLE IF EXISTS knowledge_chunks_vec");
      sqlite.exec(
        `CREATE VIRTUAL TABLE knowledge_chunks_vec USING vec0(
          chunk_id TEXT PRIMARY KEY,
          project_id TEXT PARTITION KEY,
          embedding FLOAT[${dim}]
        )`
      );
      vecDim = dim;
      markStale();
    }
    return true;
  }

  function putVecChunk(chunkId: string, projectId: string, vec: number[]): void {
    if (!vecLoaded || vecDim === null) return;
    sqlite.prepare(
      "INSERT OR REPLACE INTO knowledge_chunks_vec (chunk_id, project_id, embedding) VALUES (?, ?, ?)"
    ).run(chunkId, projectId, toVecBuffer(vec));
  }

  function delVecChunk(chunkId: string): void {
    if (!vecLoaded) return;
    const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'knowledge_chunks_vec'").get();
    if (exists) sqlite.prepare("DELETE FROM knowledge_chunks_vec WHERE chunk_id = ?").run(chunkId);
  }

  function searchKnn(
    queryVec: number[],
    k: number,
    projectId: string | null
  ): KnowledgeSource[] {
    if (!vecLoaded || vecDim === null || queryVec.length !== vecDim) return [];
    const cap = Math.max(1, Math.min(k, 50));
    const rows = projectId
      ? sqlite.prepare(`SELECT v.chunk_id AS chunk_id, v.distance AS distance
          FROM knowledge_chunks_vec v
          WHERE v.embedding MATCH ? AND v.project_id = ? AND k = ?
          ORDER BY v.distance`).all(toVecBuffer(queryVec), projectId, cap) as Array<{ chunk_id: string; distance: number }>
      : sqlite.prepare(`SELECT v.chunk_id AS chunk_id, v.distance AS distance
          FROM knowledge_chunks_vec v
          WHERE v.embedding MATCH ? AND k = ?
          ORDER BY v.distance`).all(toVecBuffer(queryVec), cap) as Array<{ chunk_id: string; distance: number }>;
    if (!rows.length) return [];
    const ids = rows.map((r) => r.chunk_id);
    const chunkRows = db.select().from(knowledgeChunks).where(inArray(knowledgeChunks.id, ids)).all();
    const byId = new Map(chunkRows.map((r) => [r.id, r]));
    // dedup by source (first hit wins — rows are distance-sorted) + resolve title/excerpt
    const bySource = new Map<string, KnowledgeSource>();
    for (const r of rows) {
      const c = byId.get(r.chunk_id);
      if (!c) continue;
      if (projectId && c.projectId !== projectId) continue;
      const key = `${c.sourceType}:${c.sourceId}`;
      if (bySource.has(key)) continue;
      bySource.set(key, {
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        projectId: c.projectId,
        title: resolveSourceTitle(c.sourceType, c.sourceId),
        excerpt: deriveExcerpt(c.content),
        chunkId: r.chunk_id
      });
    }
    return [...bySource.values()];
  }

  function getCachedEmbedding(contentHash: string, model: string): { vector: number[]; dimensions: number } | null {
    const row = db.select().from(embeddingCache)
      .where(and(eq(embeddingCache.contentHash, contentHash), eq(embeddingCache.model, model))).get();
    if (!row) return null;
    return { vector: bufferToVec(row.embedding), dimensions: row.dimensions };
  }

  function putCachedEmbedding(contentHash: string, vec: number[], model: string, dim: number): void {
    db.insert(embeddingCache).values({
      contentHash,
      embedding: toVecBuffer(vec),
      model,
      dimensions: dim
    }).onConflictDoUpdate({
      target: [embeddingCache.contentHash, embeddingCache.model],
      set: { embedding: toVecBuffer(vec), model, dimensions: dim }
    }).run();
  }

  function listPendingChunks(limit: number): Array<{
    id: string; content: string; contentHash: string; projectId: string; sourceType: "note" | "task"; sourceId: string;
  }> {
    return db.select({
      id: knowledgeChunks.id,
      content: knowledgeChunks.content,
      contentHash: knowledgeChunks.contentHash,
      projectId: knowledgeChunks.projectId,
      sourceType: knowledgeChunks.sourceType,
      sourceId: knowledgeChunks.sourceId
    })
      .from(knowledgeChunks)
      .where(or(
        inArray(knowledgeChunks.indexStatus, ["pending", "stale"]),
        and(
          eq(knowledgeChunks.indexStatus, "failed"),
          lt(knowledgeChunks.retryCount, 3),
          lte(knowledgeChunks.nextRetryAt, nowIso())
        )
      ))
      .limit(limit)
      .all();
  }

  function markChunkIndexed(chunkId: string, model: string, dim: number): void {
    db.update(knowledgeChunks).set({
      indexStatus: "indexed",
      embeddingModel: model,
      embeddingDimensions: dim,
      indexError: null,
      retryCount: 0,
      nextRetryAt: null,
      updatedAt: nowIso()
    }).where(eq(knowledgeChunks.id, chunkId)).run();
  }

  function markChunkFailed(chunkId: string, error: string): void {
    const current = db.select({ retryCount: knowledgeChunks.retryCount })
      .from(knowledgeChunks).where(eq(knowledgeChunks.id, chunkId)).get();
    const retryCount = (current?.retryCount ?? 0) + 1;
    const retryDelays = [60_000, 300_000, 1_800_000];
    db.update(knowledgeChunks).set({
      indexStatus: "failed",
      indexError: error,
      retryCount,
      nextRetryAt: retryCount <= retryDelays.length
        ? new Date(Date.now() + retryDelays[retryCount - 1]).toISOString()
        : null,
      updatedAt: nowIso()
    }).where(eq(knowledgeChunks.id, chunkId)).run();
  }

  // safe SQL string literal (single-quote escape) for raw FTS queries
  function sqlStr(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
  function extractTerms(query: string): string[] {
    // Split on whitespace + common CJK punctuation; keep letters/numbers (incl. CJK).
    return query
      .split(/[\s,，。、；;！!？?]+/)
      .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ""))
      .filter(Boolean);
  }

  return {
    runInTransaction,
    listProjects, getProject, childProjects, projectPath, createProject, upsertImportedProject, updateProject, deleteProject, ensureInbox,
    notesForProject, getNote, createNote, upsertImportedNote, updateNote, deleteNote, backlinksFor,
    columnsForProject, createColumn, upsertImportedColumn, updateColumn, deleteColumn,
    tasksForProject, createTask, upsertImportedTask, updateTask, deleteTask, moveTask,
    reindexNote, reindexTask, removeIndex, searchFts, getChunkContents, markStale, getIndexStatus,
    get vecLoaded() { return vecLoaded; },
    ensureVecTable, searchKnn, putVecChunk, delVecChunk, getCachedEmbedding, putCachedEmbedding,
    listPendingChunks, markChunkIndexed, markChunkFailed
  };
}

/** AI conversation store (Phase 4): multi-turn chat persistence with sources. */
export function createAiConversationStore(database: NeoDatabase) {
  if (database.kind !== "sqlite") {
    throw new Error("AI conversation store requires a sqlite database");
  }
  const { db } = database;

  function createConversation(projectId: string | null, mode: AiRetrievalMode): AiConversation {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    db.insert(aiConversations).values({ id, projectId, mode, createdAt: ts, updatedAt: ts }).run();
    return { id, projectId, mode, createdAt: Date.parse(ts), updatedAt: Date.parse(ts) };
  }

  function getConversation(id: string): AiConversation | null {
    const row = db.select().from(aiConversations).where(eq(aiConversations.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      projectId: row.projectId,
      mode: row.mode,
      createdAt: Date.parse(row.createdAt),
      updatedAt: Date.parse(row.updatedAt)
    };
  }

  function listMessages(conversationId: string): AiMessage[] {
    return db.select().from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .orderBy(asc(aiMessages.createdAt))
      .all()
      .map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        role: row.role,
        content: row.content,
        sources: row.sourcesJson ? safeParseSources(row.sourcesJson) : [],
        createdAt: Date.parse(row.createdAt)
      }));
  }

  function appendMessage(
    conversationId: string,
    role: AiMessage["role"],
    content: string,
    sources: KnowledgeSource[] = []
  ): AiMessage {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    db.insert(aiMessages).values({
      id,
      conversationId,
      role,
      content,
      sourcesJson: sources.length ? JSON.stringify(sources) : null,
      createdAt: ts
    }).run();
    db.update(aiConversations).set({ updatedAt: ts }).where(eq(aiConversations.id, conversationId)).run();
    return { id, conversationId, role, content, sources, createdAt: Date.parse(ts) };
  }

  return { createConversation, getConversation, listMessages, appendMessage };
}

export type AiConversationStore = ReturnType<typeof createAiConversationStore>;

function safeParseSources(json: string): KnowledgeSource[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as KnowledgeSource[]) : [];
  } catch {
    return [];
  }
}
