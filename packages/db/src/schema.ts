import { blob, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at")
});

export const focusSessions = sqliteTable("focus_sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  status: text("status", { enum: ["active", "completed", "cancelled"] }).notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  durationMinutes: integer("duration_minutes").notNull()
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull()
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull()
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const windowEvents = sqliteTable("window_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  processName: text("process_name").notNull(),
  capturedAt: text("captured_at").notNull(),
  dwellSeconds: integer("dwell_seconds").notNull(),
  classification: text("classification", { enum: ["focused", "distracted", "stuck"] }).notNull()
});

// ── Knowledge Workspace (v2) ──
// Kept separate from the v1 `tasks` table (which drives the pet-panel checklist
// with `open|done`). Knowledge kanban tasks use a 4-state status. Unification is
// tracked in docs/TODO_INVENTORY.md.

export const knowledgeProjects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  parentId: text("parent_id"),
  color: text("color"),
  icon: text("icon"),
  isInbox: integer("is_inbox", { mode: "boolean" }).notNull().default(false),
  order: integer("order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const knowledgeNotes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const knowledgeTags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique()
});

export const knowledgeNoteTags = sqliteTable("note_tags", {
  noteId: text("note_id").notNull(),
  tagId: text("tag_id").notNull()
});

export const knowledgeBoardColumns = sqliteTable("board_columns", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ["todo", "doing", "done", "archived"] }).notNull().default("todo"),
  order: integer("order").notNull().default(0)
});

export const knowledgeTasks = sqliteTable("knowledge_tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  columnId: text("column_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["todo", "doing", "done", "archived"] }).notNull().default("todo"),
  order: integer("order").notNull().default(0),
  linkedNoteId: text("linked_note_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// FTS5 + sqlite-vec retrieval targets. `knowledge_chunks` holds chunk text +
// content hash (dedup) + index lifecycle; FTS5 mirror is managed by the
// knowledge service; vec0 virtual table is created lazily when the sqlite-vec
// extension loads (Phase 3).
export const knowledgeChunks = sqliteTable("knowledge_chunks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  sourceType: text("source_type", { enum: ["note", "task"] }).notNull(),
  sourceId: text("source_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  embeddingModel: text("embedding_model"),
  embeddingDimensions: integer("embedding_dimensions"),
  indexStatus: text("index_status", { enum: ["pending", "indexed", "failed", "stale"] }).notNull().default("pending"),
  indexError: text("index_error"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: text("next_retry_at"),
  updatedAt: text("updated_at").notNull()
});

// Embedding cache keyed by content hash. Same-hash chunks reuse the stored
// vector, skipping redundant embedding API calls (Phase 3).
export const embeddingCache = sqliteTable("embedding_cache", {
  contentHash: text("content_hash").notNull(),
  embedding: blob("embedding", { mode: "buffer" }).notNull(),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull()
}, (table) => [primaryKey({ columns: [table.contentHash, table.model] })]);

// AI conversations (Phase 4). Separate from the v1 `conversations`/`messages`
// tables (pet-panel chat) — these carry knowledge RAG context + sources.
export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  mode: text("mode", { enum: ["chat", "ask"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  sourcesJson: text("sources_json"),
  createdAt: text("created_at").notNull()
});

