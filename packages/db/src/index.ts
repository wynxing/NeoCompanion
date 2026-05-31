import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type { FocusSession, Task, WindowSnapshot } from "@neo-companion/shared";
import { focusSessions, tasks, windowEvents } from "./schema";

export * from "./schema";

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

export function createDatabase(filename = process.env.NEO_DB_PATH ?? "neo-companion.sqlite") {
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
  `);
}

export function createTaskStore(database: NeoDatabase) {
  if (database.kind === "memory") {
    return {
      list(): Task[] {
        return [...database.tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
    list(): Task[] {
      return db.select().from(tasks).orderBy(tasks.createdAt).all().map(rowToTask);
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
