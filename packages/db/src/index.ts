import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";
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
import type {
  AiConversationRow,
  AiMessageRow,
  BoardColumnRow,
  EmbeddingCacheRow,
  FocusSessionRow,
  KnowledgeChunkRow,
  KnowledgeTaskRow,
  NoteRow,
  ProjectRow,
  TaskRow,
  WindowEventRow
} from "./types";

export * from "./knowledge-fs";

export type NeoDatabase =
  | {
      kind: "sqlite";
      sqlite: DatabaseSync;
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
 * Ensures the parent directory exists so the database can open the file.
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
    const sqlite = new DatabaseSync(filename, {
      allowExtension: true,
      timeout: 5_000
    });
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    initSchema(sqlite);

    return {
      kind: "sqlite" as const,
      sqlite,
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

/** True when the sqlite native binding loads (sqlite path reachable). */
export function isSqliteAvailable(): boolean {
  try {
    const probe = new DatabaseSync(":memory:", { allowExtension: true });
    probe.close();
    return true;
  } catch {
    return false;
  }
}

interface TransactionState {
  depth: number;
  nextSavepoint: number;
}

const transactionStates = new WeakMap<DatabaseSync, TransactionState>();

function withTransaction<T>(sqlite: DatabaseSync, fn: () => T): T {
  const state = transactionStates.get(sqlite) ?? { depth: 0, nextSavepoint: 0 };
  transactionStates.set(sqlite, state);

  const savepoint = state.depth === 0 ? null : `neo_tx_${state.nextSavepoint++}`;
  sqlite.exec(savepoint ? `SAVEPOINT ${savepoint}` : "BEGIN");
  state.depth += 1;

  try {
    const result = fn();
    sqlite.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : "COMMIT");
    return result;
  } catch (error) {
    if (savepoint) {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      sqlite.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } else {
      sqlite.exec("ROLLBACK");
    }
    throw error;
  } finally {
    state.depth -= 1;
    if (state.depth === 0) transactionStates.delete(sqlite);
  }
}

export function initSchema(sqlite: DatabaseSync) {
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

function runSchemaMigrations(sqlite: DatabaseSync): void {
  const applied = new Set((sqlite.prepare("SELECT version FROM schema_migrations").all() as unknown as Array<{ version: number }>).map((r) => r.version));
  const apply = (version: number, migrate: () => void) => {
    if (applied.has(version)) return;
    withTransaction(sqlite, () => {
      migrate();
      sqlite.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
    });
  };

  apply(1, () => {
    const columns = sqlite.prepare("PRAGMA table_info(embedding_cache)").all() as unknown as Array<{ name: string; pk: number }>;
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
    const names = new Set((sqlite.prepare("PRAGMA table_info(knowledge_chunks)").all() as unknown as Array<{ name: string }>).map((c) => c.name));
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
      const rows = sqlite.prepare("SELECT agent_id, command_prefix, created_at FROM hook_always_rules").all() as unknown as Array<{ agent_id: string; command_prefix: string; created_at: number }>;
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

/** Serialize a vector for sqlite BLOB binding (Float32 little-endian). */
export function toVecBuffer(vec: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vec).buffer);
}

/** Deserialize a stored BLOB back to a number[]. */
function bufferToVec(buf: Uint8Array): number[] {
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

  const { sqlite } = database;

  return {
    list(opts?: { limit?: number; offset?: number }): { items: Task[]; total: number } {
      const all = (sqlite.prepare("SELECT id, title, status, created_at, completed_at FROM tasks ORDER BY created_at").all() as unknown as TaskRow[]).map(rowToTask);
      const total = all.length;
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? all.length;
      return { items: all.slice(offset, offset + limit), total };
    },
    create(title: string): Task {
      const task = createTaskValue(title);
      sqlite.prepare("INSERT INTO tasks (id, title, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?)").run(task.id, task.title, task.status, task.createdAt, task.completedAt);
      return task;
    },
    patch(id: string, patch: Partial<Pick<Task, "title" | "status">>): Task | null {
      const existing = sqlite.prepare("SELECT id, title, status, created_at, completed_at FROM tasks WHERE id = ?").get(id) as unknown as TaskRow | undefined;
      if (!existing) return null;

      const next = patchTaskValue(rowToTask(existing), patch);
      sqlite.prepare("UPDATE tasks SET title = ?, status = ?, completed_at = ? WHERE id = ?").run(next.title, next.status, next.completedAt, id);
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

  const { sqlite } = database;

  return {
    create(taskId: string | null, durationMinutes: number): FocusSession {
      const session = createFocusValue(taskId, durationMinutes);
      sqlite.prepare("INSERT INTO focus_sessions (id, task_id, status, started_at, completed_at, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)").run(session.id, session.taskId, session.status, session.startedAt, session.completedAt, session.durationMinutes);
      return session;
    },
    updateStatus(id: string, status: FocusSession["status"]): FocusSession | null {
      const existing = sqlite.prepare("SELECT id, task_id, status, started_at, completed_at, duration_minutes FROM focus_sessions WHERE id = ?").get(id) as unknown as FocusSessionRow | undefined;
      if (!existing) return null;

      const next = patchFocusStatus(rowToFocus(existing), status);
      sqlite.prepare("UPDATE focus_sessions SET status = ?, completed_at = ? WHERE id = ?").run(next.status, next.completedAt, id);
      return next;
    },
    get(id: string): FocusSession | null {
      const existing = sqlite.prepare("SELECT id, task_id, status, started_at, completed_at, duration_minutes FROM focus_sessions WHERE id = ?").get(id) as unknown as FocusSessionRow | undefined;
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

  const { sqlite } = database;

  return {
    create(snapshot: WindowSnapshot): WindowSnapshot {
      sqlite.prepare("INSERT INTO window_events (id, title, process_name, captured_at, dwell_seconds, classification) VALUES (?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), snapshot.title, snapshot.processName, snapshot.capturedAt, snapshot.dwellSeconds, snapshot.classification);
      return snapshot;
    },
    latest(limit = 20): WindowSnapshot[] {
      return (sqlite.prepare("SELECT title, process_name, captured_at, dwell_seconds, classification FROM window_events ORDER BY captured_at LIMIT ?").all(limit) as unknown as WindowEventRow[]).map((row) => ({
        title: row.title,
        processName: row.process_name,
        capturedAt: row.captured_at,
        dwellSeconds: row.dwell_seconds,
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

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function rowToFocus(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMinutes: row.duration_minutes
  };
}

// ── Knowledge Workspace store ──
// Sync CRUD over sqlite. Timestamps are stored as ISO TEXT and mapped
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
  const { sqlite } = database;
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
    return withTransaction(sqlite, operation);
  }

  function ensureTagIds(names: string[]): string[] {
    const ids: string[] = [];
    for (const name of names) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const existing = sqlite.prepare("SELECT id FROM tags WHERE name = ?").get(trimmed) as { id: string } | undefined;
      if (existing) {
        ids.push(existing.id);
      } else {
        const id = crypto.randomUUID();
        sqlite.prepare("INSERT INTO tags (id, name) VALUES (?, ?)").run(id, trimmed);
        ids.push(id);
      }
    }
    return ids;
  }

  function loadNoteTags(noteId: string): string[] {
    const rows = sqlite.prepare("SELECT t.name AS name FROM note_tags n JOIN tags t ON n.tag_id = t.id WHERE n.note_id = ?").all(noteId) as unknown as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  function syncNoteTags(noteId: string, tags: string[]): void {
    sqlite.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
    const ids = ensureTagIds(tags);
    if (ids.length) {
      const stmt = sqlite.prepare("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)");
      for (const tagId of ids) stmt.run(noteId, tagId);
    }
  }

  function rowToProject(row: ProjectRow): KnowledgeProject {
    return {
      id: row.id, title: row.title, description: row.description ?? undefined, parentId: row.parent_id,
      color: row.color ?? undefined, icon: row.icon ?? undefined, isInbox: !!row.is_inbox, order: row.order,
      createdAt: isoToMs(row.created_at), updatedAt: isoToMs(row.updated_at)
    };
  }

  function rowToNote(row: NoteRow): KnowledgeNote {
    return {
      id: row.id, projectId: row.project_id, title: row.title, body: row.body, tags: loadNoteTags(row.id),
      createdAt: isoToMs(row.created_at), updatedAt: isoToMs(row.updated_at)
    };
  }

  function rowToColumn(row: BoardColumnRow): KnowledgeBoardColumn {
    return { id: row.id, projectId: row.project_id, title: row.title, status: row.status, order: row.order };
  }

  function rowToKnowledgeTask(row: KnowledgeTaskRow): KnowledgeTask {
    return {
      id: row.id, projectId: row.project_id, columnId: row.column_id ?? "", title: row.title,
      description: row.description ?? undefined, status: row.status, order: row.order,
      linkedNoteId: row.linked_note_id ?? undefined, tags: [],
      createdAt: isoToMs(row.created_at), updatedAt: isoToMs(row.updated_at)
    };
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function listProjects(): KnowledgeProject[] {
    return (sqlite.prepare('SELECT id, title, description, parent_id, color, icon, is_inbox, "order", created_at, updated_at FROM projects ORDER BY "order"').all() as unknown as ProjectRow[]).map(rowToProject);
  }
  function getProject(id: string): KnowledgeProject | null {
    const row = sqlite.prepare('SELECT id, title, description, parent_id, color, icon, is_inbox, "order", created_at, updated_at FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }
  function childProjects(parentId: string): KnowledgeProject[] {
    return (sqlite.prepare('SELECT id, title, description, parent_id, color, icon, is_inbox, "order", created_at, updated_at FROM projects WHERE parent_id = ? ORDER BY "order"').all(parentId) as unknown as ProjectRow[]).map(rowToProject);
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
    sqlite.prepare('INSERT INTO projects (id, title, description, parent_id, color, icon, is_inbox, "order", created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, input.title.trim(), input.description ?? null, input.parentId ?? null, input.color ?? null, input.icon ?? null,
      input.isInbox ? 1 : 0, input.order ?? 0, ts, ts
    );
    return getProject(id)!;
  }
  function upsertImportedProject(project: KnowledgeProject): void {
    sqlite.prepare(`INSERT INTO projects (id, title, description, parent_id, color, icon, is_inbox, "order", created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, parent_id=excluded.parent_id,
        color=excluded.color, icon=excluded.icon, is_inbox=excluded.is_inbox, "order"=excluded."order", updated_at=excluded.updated_at`).run(
      project.id, project.title, project.description ?? null, project.parentId, project.color ?? null, project.icon ?? null,
      project.isInbox ? 1 : 0, project.order, new Date(project.createdAt).toISOString(), new Date(project.updatedAt).toISOString()
    );
  }
  function updateProject(id: string, patch: Partial<Pick<KnowledgeProject, "title" | "description" | "color" | "icon" | "parentId" | "order">>): KnowledgeProject | null {
    const existing = sqlite.prepare('SELECT id, title, description, parent_id, color, icon, is_inbox, "order", created_at, updated_at FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined;
    if (!existing) return null;
    sqlite.prepare('UPDATE projects SET title = ?, description = ?, color = ?, icon = ?, parent_id = ?, "order" = ?, updated_at = ? WHERE id = ?').run(
      patch.title?.trim() ?? existing.title,
      patch.description !== undefined ? patch.description : existing.description,
      patch.color !== undefined ? patch.color : existing.color,
      patch.icon !== undefined ? patch.icon : existing.icon,
      patch.parentId !== undefined ? patch.parentId : existing.parent_id,
      patch.order ?? existing.order,
      nowIso(), id
    );
    return getProject(id);
  }
  function deleteProject(id: string): void {
    withTransaction(sqlite, () => {
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
          sqlite.prepare("DELETE FROM note_tags WHERE note_id = ?").run(note.id);
        }
        for (const task of tasksForProject(projectId)) removeIndex("task", task.id);
        sqlite.prepare("DELETE FROM notes WHERE project_id = ?").run(projectId);
        sqlite.prepare("DELETE FROM board_columns WHERE project_id = ?").run(projectId);
        sqlite.prepare("DELETE FROM knowledge_tasks WHERE project_id = ?").run(projectId);
        sqlite.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
      }
    });
  }
  function ensureInbox(): KnowledgeProject {
    const existing = sqlite.prepare("SELECT id FROM projects WHERE is_inbox = 1").get() as { id: string } | undefined;
    if (existing) return getProject(existing.id)!;
    return createProject({ title: "收件箱", description: "临时想法与未分类内容", color: "#6b7280", isInbox: true, order: 0 });
  }

  function notesForProject(projectId: string): KnowledgeNote[] {
    return (sqlite.prepare("SELECT id, project_id, title, body, created_at, updated_at FROM notes WHERE project_id = ? ORDER BY updated_at").all(projectId) as unknown as NoteRow[]).map(rowToNote);
  }
  function getNote(id: string): KnowledgeNote | null {
    const row = sqlite.prepare("SELECT id, project_id, title, body, created_at, updated_at FROM notes WHERE id = ?").get(id) as unknown as NoteRow | undefined;
    return row ? rowToNote(row) : null;
  }
  function createNote(projectId: string, title: string): KnowledgeNote {
    const id = crypto.randomUUID();
    const ts = nowIso();
    sqlite.prepare("INSERT INTO notes (id, project_id, title, body, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?)").run(id, projectId, title.trim() || "无标题笔记", ts, ts);
    return getNote(id)!;
  }
  function upsertImportedNote(note: KnowledgeNote): void {
    sqlite.prepare(`INSERT INTO notes (id, project_id, title, body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, title=excluded.title, body=excluded.body, updated_at=excluded.updated_at`).run(
      note.id, note.projectId, note.title, note.body, new Date(note.createdAt).toISOString(), new Date(note.updatedAt).toISOString()
    );
    syncNoteTags(note.id, note.tags);
  }
  function updateNote(id: string, patch: Partial<Pick<KnowledgeNote, "title" | "body" | "tags">>): KnowledgeNote | null {
    const existing = sqlite.prepare("SELECT id, project_id, title, body, created_at, updated_at FROM notes WHERE id = ?").get(id) as unknown as NoteRow | undefined;
    if (!existing) return null;
    sqlite.prepare("UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?").run(
      patch.title !== undefined ? patch.title.trim() : existing.title,
      patch.body !== undefined ? patch.body : existing.body,
      nowIso(), id
    );
    if (patch.tags !== undefined) syncNoteTags(id, patch.tags);
    return getNote(id);
  }
  function deleteNote(id: string): void {
    withTransaction(sqlite, () => {
      removeIndex("note", id);
      sqlite.prepare("DELETE FROM note_tags WHERE note_id = ?").run(id);
      sqlite.prepare("DELETE FROM notes WHERE id = ?").run(id);
    });
  }
  function backlinksFor(targetId: string): { sourceType: "note" | "task"; sourceId: string }[] {
    const pattern = `%[[${targetId}]%`;
    const rows = sqlite.prepare("SELECT id FROM notes WHERE body LIKE ?").all(pattern) as unknown as Array<{ id: string }>;
    return rows.map((r) => ({ sourceType: "note" as const, sourceId: r.id }));
  }

  function columnsForProject(projectId: string): KnowledgeBoardColumn[] {
    return (sqlite.prepare('SELECT id, project_id, title, status, "order" FROM board_columns WHERE project_id = ? ORDER BY "order"').all(projectId) as unknown as BoardColumnRow[]).map(rowToColumn);
  }
  function createColumn(projectId: string, input: { title: string; status: KnowledgeTaskStatus; order: number }): KnowledgeBoardColumn {
    const id = crypto.randomUUID();
    sqlite.prepare('INSERT INTO board_columns (id, project_id, title, status, "order") VALUES (?, ?, ?, ?, ?)').run(id, projectId, input.title.trim(), input.status, input.order);
    const row = sqlite.prepare('SELECT id, project_id, title, status, "order" FROM board_columns WHERE id = ?').get(id) as unknown as BoardColumnRow;
    return rowToColumn(row);
  }
  function upsertImportedColumn(column: KnowledgeBoardColumn): void {
    sqlite.prepare(`INSERT INTO board_columns (id, project_id, title, status, "order")
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, title=excluded.title, status=excluded.status, "order"=excluded."order"`).run(
      column.id, column.projectId, column.title, column.status, column.order
    );
  }
  function updateColumn(id: string, patch: Partial<Pick<KnowledgeBoardColumn, "title" | "status" | "order">>): KnowledgeBoardColumn | null {
    const existing = sqlite.prepare('SELECT id, project_id, title, status, "order" FROM board_columns WHERE id = ?').get(id) as unknown as BoardColumnRow | undefined;
    if (!existing) return null;
    sqlite.prepare('UPDATE board_columns SET title = ?, status = ?, "order" = ? WHERE id = ?').run(
      patch.title?.trim() ?? existing.title,
      patch.status ?? existing.status,
      patch.order ?? existing.order,
      id
    );
    const row = sqlite.prepare('SELECT id, project_id, title, status, "order" FROM board_columns WHERE id = ?').get(id) as unknown as BoardColumnRow | undefined;
    return row ? rowToColumn(row) : null;
  }
  function deleteColumn(id: string): void {
    sqlite.prepare("UPDATE knowledge_tasks SET column_id = NULL WHERE column_id = ?").run(id);
    sqlite.prepare("DELETE FROM board_columns WHERE id = ?").run(id);
  }

  function tasksForProject(projectId: string): KnowledgeTask[] {
    return (sqlite.prepare('SELECT id, project_id, column_id, title, description, status, "order", linked_note_id, created_at, updated_at FROM knowledge_tasks WHERE project_id = ? ORDER BY "order"').all(projectId) as unknown as KnowledgeTaskRow[]).map(rowToKnowledgeTask);
  }
  function createTask(projectId: string, columnId: string, title: string): KnowledgeTask {
    const id = crypto.randomUUID();
    const ts = nowIso();
    sqlite.prepare('INSERT INTO knowledge_tasks (id, project_id, column_id, title, status, "order", linked_note_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, projectId, columnId || null, title.trim(), "todo", 0, null, ts, ts
    );
    const row = sqlite.prepare('SELECT id, project_id, column_id, title, description, status, "order", linked_note_id, created_at, updated_at FROM knowledge_tasks WHERE id = ?').get(id) as unknown as KnowledgeTaskRow;
    return rowToKnowledgeTask(row);
  }
  function upsertImportedTask(task: KnowledgeTask): void {
    sqlite.prepare(`INSERT INTO knowledge_tasks (id, project_id, column_id, title, description, status, "order", linked_note_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, column_id=excluded.column_id, title=excluded.title,
        description=excluded.description, status=excluded.status, "order"=excluded."order", linked_note_id=excluded.linked_note_id, updated_at=excluded.updated_at`).run(
      task.id, task.projectId, task.columnId || null, task.title, task.description ?? null, task.status, task.order, task.linkedNoteId ?? null,
      new Date(task.createdAt).toISOString(), new Date(task.updatedAt).toISOString()
    );
  }
  function updateTask(id: string, patch: { title?: string; description?: string; status?: KnowledgeTaskStatus; columnId?: string; order?: number; linkedNoteId?: string | null }): KnowledgeTask | null {
    const existing = sqlite.prepare('SELECT id, project_id, column_id, title, description, status, "order", linked_note_id, created_at, updated_at FROM knowledge_tasks WHERE id = ?').get(id) as unknown as KnowledgeTaskRow | undefined;
    if (!existing) return null;
    sqlite.prepare('UPDATE knowledge_tasks SET title = ?, description = ?, status = ?, column_id = ?, "order" = ?, linked_note_id = ?, updated_at = ? WHERE id = ?').run(
      patch.title !== undefined ? patch.title.trim() : existing.title,
      patch.description !== undefined ? patch.description : existing.description,
      patch.status ?? existing.status,
      patch.columnId !== undefined ? (patch.columnId || null) : existing.column_id,
      patch.order ?? existing.order,
      patch.linkedNoteId !== undefined ? patch.linkedNoteId : existing.linked_note_id,
      nowIso(), id
    );
    const row = sqlite.prepare('SELECT id, project_id, column_id, title, description, status, "order", linked_note_id, created_at, updated_at FROM knowledge_tasks WHERE id = ?').get(id) as unknown as KnowledgeTaskRow | undefined;
    return row ? rowToKnowledgeTask(row) : null;
  }
  function deleteTask(id: string): void {
    withTransaction(sqlite, () => {
      removeIndex("task", id);
      sqlite.prepare("DELETE FROM knowledge_tasks WHERE id = ?").run(id);
    });
  }
  function moveTask(taskId: string, targetColumnId: string, targetIndex: number): void {
    const task = sqlite.prepare("SELECT id, project_id, column_id FROM knowledge_tasks WHERE id = ?").get(taskId) as { id: string; project_id: string; column_id: string | null } | undefined;
    if (!task) return;
    const projectId = task.project_id;
    const siblings = (sqlite.prepare('SELECT id, project_id, column_id, title, description, status, "order", linked_note_id, created_at, updated_at FROM knowledge_tasks WHERE project_id = ? AND column_id = ? ORDER BY "order"').all(projectId, targetColumnId) as unknown as KnowledgeTaskRow[]).filter((t) => t.id !== taskId);
    const clamped = Math.max(0, Math.min(targetIndex, siblings.length));
    siblings.splice(clamped, 0, { ...task, column_id: targetColumnId } as KnowledgeTaskRow);
    const stmt = sqlite.prepare('UPDATE knowledge_tasks SET column_id = ?, "order" = ? WHERE id = ?');
    siblings.forEach((t, idx) => stmt.run(targetColumnId, idx, t.id));
  }

  function reindexNote(note: KnowledgeNote, chunk: (text: string) => { content: string; contentHash: string }[]): void {
    const text = note.body ? `${note.title}\n\n${note.body}` : note.title;
    const pieces = chunk(text);
    withTransaction(sqlite, () => {
      removeIndex("note", note.id);
      const now = nowIso();
      const insertChunk = sqlite.prepare("INSERT INTO knowledge_chunks (id, project_id, source_type, source_id, ordinal, content, content_hash, embedding_model, embedding_dimensions, index_status, index_error, retry_count, next_retry_at, updated_at) VALUES (?, ?, 'note', ?, ?, ?, ?, NULL, NULL, 'pending', NULL, 0, NULL, ?)");
      const insertFts = sqlite.prepare("INSERT INTO knowledge_chunks_fts (chunk_id, content, project_id, source_type, source_id, content_hash) VALUES (?, ?, ?, 'note', ?, ?)");
      pieces.forEach((piece, ordinal) => {
        const chunkId = crypto.randomUUID();
        insertChunk.run(chunkId, note.projectId, note.id, ordinal, piece.content, piece.contentHash, now);
        insertFts.run(chunkId, piece.content, note.projectId, note.id, piece.contentHash);
      });
    });
  }

  function reindexTask(task: KnowledgeTask, chunk: (text: string) => { content: string; contentHash: string }[]): void {
    const text = task.description ? `${task.title}\n\n${task.description}` : task.title;
    const pieces = chunk(text);
    withTransaction(sqlite, () => {
      removeIndex("task", task.id);
      const now = nowIso();
      const insertChunk = sqlite.prepare("INSERT INTO knowledge_chunks (id, project_id, source_type, source_id, ordinal, content, content_hash, embedding_model, embedding_dimensions, index_status, index_error, retry_count, next_retry_at, updated_at) VALUES (?, ?, 'task', ?, ?, ?, ?, NULL, NULL, 'pending', NULL, 0, NULL, ?)");
      const insertFts = sqlite.prepare("INSERT INTO knowledge_chunks_fts (chunk_id, content, project_id, source_type, source_id, content_hash) VALUES (?, ?, ?, 'task', ?, ?)");
      pieces.forEach((piece, ordinal) => {
        const chunkId = crypto.randomUUID();
        insertChunk.run(chunkId, task.projectId, task.id, ordinal, piece.content, piece.contentHash, now);
        insertFts.run(chunkId, piece.content, task.projectId, task.id, piece.contentHash);
      });
    });
  }

  function removeIndex(sourceType: "note" | "task", sourceId: string): void {
    const chunkIds = (sqlite.prepare("SELECT id FROM knowledge_chunks WHERE source_type = ? AND source_id = ?").all(sourceType, sourceId) as unknown as Array<{ id: string }>).map((r) => r.id);
    for (const cid of chunkIds) delVecChunk(cid);
    sqlite.exec(`DELETE FROM knowledge_chunks_fts WHERE source_type = ${sqlStr(sourceType)} AND source_id = ${sqlStr(sourceId)}`);
    sqlite.prepare("DELETE FROM knowledge_chunks WHERE source_type = ? AND source_id = ?").run(sourceType, sourceId);
  }

  function searchFts(projectId: string | null, query: string, limit: number): KnowledgeSource[] {
    const terms = extractTerms(query);
    if (!terms.length) return [];
    const useMatch = terms.every((t) => [...t].length >= 3);
    const cap = Math.max(1, Math.min(limit, 50));
    const projectClause = projectId ? ` AND k.project_id = ${sqlStr(projectId)}` : "";
    let sql: string;
    if (useMatch) {
      const ftsQuery = terms.map((t) => `"${t.replace(/"/g, "")}"*`).join(" OR ");
      sql = `SELECT k.chunk_id, k.source_type, k.source_id, k.project_id, k.content, bm25(knowledge_chunks_fts) AS rank FROM knowledge_chunks_fts k WHERE k.content MATCH ${sqlStr(ftsQuery)}${projectClause} ORDER BY rank LIMIT ${cap}`;
    } else {
      const likeTerms = terms.map((t) => `k.content LIKE ${sqlStr(`%${t.replace(/[%_]/g, "\\$&")}%`)} ESCAPE '\\'`);
      sql = `SELECT k.chunk_id, k.source_type, k.source_id, k.project_id, k.content, 0 AS rank FROM knowledge_chunks_fts k WHERE (${likeTerms.join(" OR ")})${projectClause} LIMIT ${cap}`;
    }
    const rows = sqlite.prepare(sql).all() as unknown as Array<{ chunk_id: string; source_type: "note" | "task"; source_id: string; project_id: string; content: string; rank: number }>;
    const bySource = new Map<string, KnowledgeSource>();
    for (const row of rows) {
      const key = `${row.source_type}:${row.source_id}`;
      if (bySource.has(key)) continue;
      bySource.set(key, {
        sourceType: row.source_type, sourceId: row.source_id, projectId: row.project_id,
        title: resolveSourceTitle(row.source_type, row.source_id),
        excerpt: deriveExcerpt(row.content), chunkId: row.chunk_id
      });
    }
    return [...bySource.values()];
  }

  function getChunkContents(chunkIds: string[]): Map<string, string> {
    if (!chunkIds.length) return new Map();
    const placeholders = chunkIds.map(() => "?").join(",");
    const rows = sqlite.prepare(`SELECT id, content FROM knowledge_chunks WHERE id IN (${placeholders})`).all(...chunkIds) as unknown as Array<{ id: string; content: string }>;
    return new Map(rows.map((row) => [row.id, row.content]));
  }

  function resolveSourceTitle(sourceType: "note" | "task", sourceId: string): string {
    if (sourceType === "note") {
      const row = sqlite.prepare("SELECT title FROM notes WHERE id = ?").get(sourceId) as { title?: string } | undefined;
      return row?.title ?? "未命名笔记";
    }
    const row = sqlite.prepare("SELECT title FROM knowledge_tasks WHERE id = ?").get(sourceId) as { title?: string } | undefined;
    return row?.title ?? "未命名任务";
  }

  function deriveExcerpt(content: string, maxChars = 120): string {
    const flat = content.replace(/[#>*_~`]/g, "").replace(/\s+/g, " ").trim();
    return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1)}…`;
  }

  function markStale(embeddingModel?: string): void {
    if (embeddingModel) {
      sqlite.prepare("UPDATE knowledge_chunks SET index_status = 'stale' WHERE index_status = 'indexed' AND (embedding_model IS NULL OR embedding_model != ?)").run(embeddingModel);
    } else {
      sqlite.exec("UPDATE knowledge_chunks SET index_status = 'stale' WHERE index_status = 'indexed'");
    }
  }

  function getIndexStatus(providerConfigured: boolean): IndexStatus {
    const countBy = (status: string): number => {
      const row = sqlite.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE index_status = ?").get(status) as { n: number } | undefined;
      return row?.n ?? 0;
    };
    const pending = countBy("pending");
    const stale = countBy("stale");
    const retrying = (sqlite.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE index_status = 'failed' AND retry_count < 3 AND next_retry_at IS NOT NULL").get() as { n: number }).n;
    const hybridCapable = vecLoaded && providerConfigured;
    const mode: IndexStatus["mode"] = hybridCapable ? (pending + stale + retrying > 0 ? "indexing" : "hybrid") : "fts-only";
    return { mode, pending, failed: countBy("failed"), stale, retrying, providerConfigured, vectorExtensionAvailable: vecLoaded, vecVersion, vecLoadError: vecLoaded ? undefined : vecLoadError };
  }

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
      sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_vec USING vec0(chunk_id TEXT PRIMARY KEY, project_id TEXT PARTITION KEY, embedding FLOAT[${dim}])`);
      vecDim = dim;
    } else if (vecDim !== dim) {
      sqlite.exec("DROP TABLE IF EXISTS knowledge_chunks_vec");
      sqlite.exec(`CREATE VIRTUAL TABLE knowledge_chunks_vec USING vec0(chunk_id TEXT PRIMARY KEY, project_id TEXT PARTITION KEY, embedding FLOAT[${dim}])`);
      vecDim = dim;
      markStale();
    }
    return true;
  }

  function putVecChunk(chunkId: string, projectId: string, vec: number[]): void {
    if (!vecLoaded || vecDim === null) return;
    sqlite.prepare("INSERT OR REPLACE INTO knowledge_chunks_vec (chunk_id, project_id, embedding) VALUES (?, ?, ?)").run(chunkId, projectId, toVecBuffer(vec));
  }

  function delVecChunk(chunkId: string): void {
    if (!vecLoaded) return;
    const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'knowledge_chunks_vec'").get();
    if (exists) sqlite.prepare("DELETE FROM knowledge_chunks_vec WHERE chunk_id = ?").run(chunkId);
  }

  function searchKnn(queryVec: number[], k: number, projectId: string | null): KnowledgeSource[] {
    if (!vecLoaded || vecDim === null || queryVec.length !== vecDim) return [];
    const cap = Math.max(1, Math.min(k, 50));
    const rows = projectId
      ? sqlite.prepare("SELECT v.chunk_id AS chunk_id, v.distance AS distance FROM knowledge_chunks_vec v WHERE v.embedding MATCH ? AND v.project_id = ? AND k = ? ORDER BY v.distance").all(toVecBuffer(queryVec), projectId, cap) as unknown as Array<{ chunk_id: string; distance: number }>
      : sqlite.prepare("SELECT v.chunk_id AS chunk_id, v.distance AS distance FROM knowledge_chunks_vec v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance").all(toVecBuffer(queryVec), cap) as unknown as Array<{ chunk_id: string; distance: number }>;
    if (!rows.length) return [];
    const ids = rows.map((r) => r.chunk_id);
    const placeholders = ids.map(() => "?").join(",");
    const chunkRows = sqlite.prepare(`SELECT id, project_id, source_type, source_id, ordinal, content, content_hash, embedding_model, embedding_dimensions, index_status, index_error, retry_count, next_retry_at, updated_at FROM knowledge_chunks WHERE id IN (${placeholders})`).all(...ids) as unknown as KnowledgeChunkRow[];
    const byId = new Map(chunkRows.map((r) => [r.id, r]));
    const bySource = new Map<string, KnowledgeSource>();
    for (const r of rows) {
      const c = byId.get(r.chunk_id);
      if (!c) continue;
      if (projectId && c.project_id !== projectId) continue;
      const key = `${c.source_type}:${c.source_id}`;
      if (bySource.has(key)) continue;
      bySource.set(key, {
        sourceType: c.source_type, sourceId: c.source_id, projectId: c.project_id,
        title: resolveSourceTitle(c.source_type, c.source_id),
        excerpt: deriveExcerpt(c.content), chunkId: r.chunk_id
      });
    }
    return [...bySource.values()];
  }

  function getCachedEmbedding(contentHash: string, model: string): { vector: number[]; dimensions: number } | null {
    const row = sqlite.prepare("SELECT embedding, dimensions FROM embedding_cache WHERE content_hash = ? AND model = ?").get(contentHash, model) as { embedding: Uint8Array; dimensions: number } | undefined;
    if (!row) return null;
    return { vector: bufferToVec(row.embedding), dimensions: row.dimensions };
  }

  function putCachedEmbedding(contentHash: string, vec: number[], model: string, dim: number): void {
    sqlite.prepare("INSERT INTO embedding_cache (content_hash, embedding, model, dimensions) VALUES (?, ?, ?, ?) ON CONFLICT(content_hash, model) DO UPDATE SET embedding=excluded.embedding, model=excluded.model, dimensions=excluded.dimensions").run(contentHash, toVecBuffer(vec), model, dim);
  }

  function listPendingChunks(limit: number): Array<{ id: string; content: string; contentHash: string; projectId: string; sourceType: "note" | "task"; sourceId: string }> {
    const rows = sqlite.prepare("SELECT id, content, content_hash, project_id, source_type, source_id FROM knowledge_chunks WHERE index_status IN ('pending', 'stale') OR (index_status = 'failed' AND retry_count < 3 AND next_retry_at <= ?) LIMIT ?").all(nowIso(), limit) as unknown as Array<{ id: string; content: string; content_hash: string; project_id: string; source_type: "note" | "task"; source_id: string }>;
    return rows.map((r) => ({ id: r.id, content: r.content, contentHash: r.content_hash, projectId: r.project_id, sourceType: r.source_type, sourceId: r.source_id }));
  }

  function markChunkIndexed(chunkId: string, model: string, dim: number): void {
    sqlite.prepare("UPDATE knowledge_chunks SET index_status = 'indexed', embedding_model = ?, embedding_dimensions = ?, index_error = NULL, retry_count = 0, next_retry_at = NULL, updated_at = ? WHERE id = ?").run(model, dim, nowIso(), chunkId);
  }

  function markChunkFailed(chunkId: string, error: string): void {
    const current = sqlite.prepare("SELECT retry_count FROM knowledge_chunks WHERE id = ?").get(chunkId) as { retry_count: number } | undefined;
    const retryCount = (current?.retry_count ?? 0) + 1;
    const retryDelays = [60_000, 300_000, 1_800_000];
    sqlite.prepare("UPDATE knowledge_chunks SET index_status = 'failed', index_error = ?, retry_count = ?, next_retry_at = ?, updated_at = ? WHERE id = ?").run(
      error, retryCount,
      retryCount <= retryDelays.length ? new Date(Date.now() + retryDelays[retryCount - 1]).toISOString() : null,
      nowIso(), chunkId
    );
  }

  function sqlStr(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
  function extractTerms(query: string): string[] {
    return query.split(/[\s,，。、；;！!？?]+/).map((t) => t.replace(/[^\p{L}\p{N}]+/gu, "")).filter(Boolean);
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

export function createAiConversationStore(database: NeoDatabase) {
  if (database.kind !== "sqlite") {
    throw new Error("AI conversation store requires a sqlite database");
  }
  const { sqlite } = database;

  function createConversation(projectId: string | null, mode: AiRetrievalMode): AiConversation {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    sqlite.prepare("INSERT INTO ai_conversations (id, project_id, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, projectId, mode, ts, ts);
    return { id, projectId, mode, createdAt: Date.parse(ts), updatedAt: Date.parse(ts) };
  }

  function getConversation(id: string): AiConversation | null {
    const row = sqlite.prepare("SELECT id, project_id, mode, created_at, updated_at FROM ai_conversations WHERE id = ?").get(id) as unknown as AiConversationRow | undefined;
    if (!row) return null;
    return { id: row.id, projectId: row.project_id, mode: row.mode, createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at) };
  }

  function listMessages(conversationId: string): AiMessage[] {
    return (sqlite.prepare("SELECT id, conversation_id, role, content, sources_json, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at").all(conversationId) as unknown as AiMessageRow[]).map((row) => ({
      id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content,
      sources: row.sources_json ? safeParseSources(row.sources_json) : [], createdAt: Date.parse(row.created_at)
    }));
  }

  function appendMessage(conversationId: string, role: AiMessage["role"], content: string, sources: KnowledgeSource[] = []): AiMessage {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    sqlite.prepare("INSERT INTO ai_messages (id, conversation_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, conversationId, role, content, sources.length ? JSON.stringify(sources) : null, ts);
    sqlite.prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?").run(ts, conversationId);
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
