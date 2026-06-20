import { describe, expect, it } from "vitest";
import { createDatabase, createFocusStore, createKnowledgeStore, createTaskStore, createWindowEventStore } from "./index";

// better-sqlite3's native binding may be unavailable in some environments
// (e.g. Node 24 without a prebuilt binary). The knowledge store requires the
// sqlite path; skip its tests when only the memory fallback is reachable.
const SQLITE_AVAILABLE = createDatabase(":memory:").kind === "sqlite";

describe("db stores", () => {
  it("persists todo CRUD and focus sessions", () => {
    const database = createDatabase(":memory:");
    const tasks = createTaskStore(database);
    const focus = createFocusStore(database);

    const task = tasks.create("写 v1 骨架");
    expect(task.status).toBe("open");
    expect(tasks.list()).toHaveLength(1);

    const done = tasks.patch(task.id, { status: "done" });
    expect(done?.completedAt).toBeTruthy();

    const session = focus.create(task.id, 25);
    expect(session.status).toBe("active");
    expect(focus.updateStatus(session.id, "completed")?.completedAt).toBeTruthy();
    database.close();
  });

  it("stores only window metadata", () => {
    const database = createDatabase(":memory:");
    const windows = createWindowEventStore(database);
    const snapshot = windows.create({
      title: "Visual Studio Code",
      processName: "Code.exe",
      capturedAt: new Date().toISOString(),
      dwellSeconds: 90,
      classification: "focused"
    });

    expect(snapshot).not.toHaveProperty("screenshot");
    expect(windows.latest(1)[0]?.processName).toBe("Code.exe");
    database.close();
  });
});

describe.skipIf(!SQLITE_AVAILABLE)("knowledge store", () => {
  it("persists projects, notes, columns, tasks with mock-compatible shapes", () => {
    const database = createDatabase(":memory:");
    const kw = createKnowledgeStore(database);

    const inbox = kw.ensureInbox();
    expect(inbox.isInbox).toBe(true);
    expect(kw.ensureInbox().id).toBe(inbox.id);

    const project = kw.createProject({ title: "产品研究", color: "#3b82f6", order: 1 });
    const child = kw.createProject({ title: "竞品", parentId: project.id });
    expect(kw.childProjects(project.id)).toHaveLength(1);
    expect(kw.projectPath(child.id).map((p) => p.id)).toEqual([project.id, child.id]);

    // timestamps are epoch-ms numbers (mock contract)
    expect(typeof project.createdAt).toBe("number");
    expect(typeof project.updatedAt).toBe("number");

    const column = kw.createColumn(project.id, { title: "待办", status: "todo", order: 0 });
    expect(kw.columnsForProject(project.id)).toHaveLength(1);

    const note = kw.createNote(project.id, "RRF 笔记");
    const updated = kw.updateNote(note.id, { body: "见 [[t-100]]", tags: ["技术", "检索"] });
    expect(updated?.body).toBe("见 [[t-100]]");
    expect(updated?.tags).toEqual(expect.arrayContaining(["技术", "检索"]));
    expect(kw.notesForProject(project.id)[0].tags).toHaveLength(2);

    const task = kw.createTask(project.id, column.id, "实现 RRF");
    expect(task.columnId).toBe(column.id);
    expect(task.status).toBe("todo");

    // move task reorders within a column
    const task2 = kw.createTask(project.id, column.id, "写测试");
    kw.moveTask(task2.id, column.id, 0);
    const ordered = kw.tasksForProject(project.id);
    expect(ordered[0].id).toBe(task2.id);

    // backlinks scan notes referencing a target id
    const links = kw.backlinksFor("t-100");
    expect(links.some((l) => l.sourceId === note.id)).toBe(true);

    // cascade delete
    kw.deleteProject(project.id);
    expect(kw.getProject(project.id)).toBeNull();
    expect(kw.notesForProject(project.id)).toHaveLength(0);
    database.close();
  });
});
