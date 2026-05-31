import { describe, expect, it } from "vitest";
import { createDatabase, createFocusStore, createTaskStore, createWindowEventStore } from "./index";

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
