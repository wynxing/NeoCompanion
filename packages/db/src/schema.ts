import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
