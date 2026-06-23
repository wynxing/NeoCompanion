/**
 * 手写的数据库行类型，对应 node:sqlite 查询返回的原始行。
 * 字段名用 snake_case，与 `initSchema` 中的 CREATE TABLE 列名一致。
 * mapper 函数（rowToTask 等）负责将 snake_case 转为 camelCase 业务类型。
 *
 * 仅覆盖实际被查询的表；conversations/messages/settings（v1 遗留，未被 store 使用）
 * 和 app_config/hook_always_rules/schema_migrations（已用原生 SQL）不在此列。
 */

export interface TaskRow {
  id: string;
  title: string;
  status: "open" | "done";
  created_at: string;
  completed_at: string | null;
}

export interface FocusSessionRow {
  id: string;
  task_id: string | null;
  status: "active" | "completed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  duration_minutes: number;
}

export interface WindowEventRow {
  id: string;
  title: string;
  process_name: string;
  captured_at: string;
  dwell_seconds: number;
  classification: "focused" | "distracted" | "stuck";
}

export interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  parent_id: string | null;
  color: string | null;
  icon: string | null;
  is_inbox: number; // INTEGER 0/1，mapper 转 boolean
  order: number;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  project_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  name: string;
}

export interface NoteTagRow {
  note_id: string;
  tag_id: string;
}

export interface BoardColumnRow {
  id: string;
  project_id: string;
  title: string;
  status: "todo" | "doing" | "done" | "archived";
  order: number;
}

export interface KnowledgeTaskRow {
  id: string;
  project_id: string;
  column_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done" | "archived";
  order: number;
  linked_note_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunkRow {
  id: string;
  project_id: string;
  source_type: "note" | "task";
  source_id: string;
  ordinal: number;
  content: string;
  content_hash: string;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  index_status: "pending" | "indexed" | "failed" | "stale";
  index_error: string | null;
  retry_count: number;
  next_retry_at: string | null;
  updated_at: string;
}

export interface EmbeddingCacheRow {
  content_hash: string;
  embedding: Uint8Array; // BLOB，node:sqlite 读回为 Uint8Array
  model: string;
  dimensions: number;
}

export interface AiConversationRow {
  id: string;
  project_id: string | null;
  mode: "chat" | "ask";
  created_at: string;
  updated_at: string;
}

export interface AiMessageRow {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  sources_json: string | null;
  created_at: string;
}
