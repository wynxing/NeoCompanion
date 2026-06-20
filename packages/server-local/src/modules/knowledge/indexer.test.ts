import { describe, expect, it } from "vitest";
import { createDatabase, createKnowledgeStore, isSqliteAvailable } from "@neo-companion/db";
import { createKnowledgeService } from "./service";

// Skipped when better-sqlite3 native binding is unavailable (this environment).
describe.skipIf(!isSqliteAvailable())("knowledge indexer (FTS5)", () => {
  it("reindexes a note and returns it via FTS5 search", () => {
    const database = createDatabase(":memory:");
    const store = createKnowledgeStore(database);
    const service = createKnowledgeService(store);

    const project = store.createProject({ title: "研究" });
    const note = store.createNote(project.id, "RRF 检索融合");
    store.updateNote(note.id, { body: "使用倒数排名融合 RRF 把 BM25 与向量结果合并。" });

    // createNote/updateNote via store don't auto-index; service.reindexNote does.
    service.reindexNote(store.getNote(note.id)!);

    const hits = service.search(project.id, "RRF");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].sourceId).toBe(note.id);
    expect(hits[0].sourceType).toBe("note");
    expect(hits[0].title).toBe("RRF 检索融合");
    database.close();
  });

  it("scopes search to a project and dedups by source", () => {
    const database = createDatabase(":memory:");
    const store = createKnowledgeStore(database);
    const service = createKnowledgeService(store);

    const a = store.createProject({ title: "A" });
    const b = store.createProject({ title: "B" });
    const noteA = store.createNote(a.id, "向量检索");
    store.updateNote(noteA.id, { body: "sqlite-vec 向量检索与余弦相似度。" });
    service.reindexNote(store.getNote(noteA.id)!);
    const noteB = store.createNote(b.id, "向量检索 B");
    store.updateNote(noteB.id, { body: "另一个项目的向量检索内容。" });
    service.reindexNote(store.getNote(noteB.id)!);

    const scoped = service.search(a.id, "向量");
    expect(scoped.every((h) => h.projectId === a.id)).toBe(true);
    expect(scoped.some((h) => h.sourceId === noteA.id)).toBe(true);

    const all = service.search(null, "向量");
    expect(all.length).toBeGreaterThanOrEqual(2);
    database.close();
  });

  it("removes stale chunks on reindex (no duplicate FTS hits)", () => {
    const database = createDatabase(":memory:");
    const store = createKnowledgeStore(database);
    const service = createKnowledgeService(store);

    const project = store.createProject({ title: "P" });
    const note = store.createNote(project.id, "初稿");
    store.updateNote(note.id, { body: "旧内容 alpha" });
    service.reindexNote(store.getNote(note.id)!);
    store.updateNote(note.id, { body: "新内容 beta gamma" });
    service.reindexNote(store.getNote(note.id)!);

    // old term should no longer match
    expect(service.search(project.id, "alpha")).toHaveLength(0);
    expect(service.search(project.id, "gamma")).toHaveLength(1);
    database.close();
  });

  it("reports index status (fts-only when no vector ext)", () => {
    const database = createDatabase(":memory:");
    const store = createKnowledgeStore(database);
    const service = createKnowledgeService(store);
    const status = service.indexStatus(false, false);
    expect(status.mode).toBe("fts-only");
    expect(status.vectorExtensionAvailable).toBe(false);
    database.close();
  });

  it("reindexAll walks every project", () => {
    const database = createDatabase(":memory:");
    const store = createKnowledgeStore(database);
    const service = createKnowledgeService(store);
    const p = store.createProject({ title: "P" });
    store.createNote(p.id, "笔记一");
    store.createTask(p.id, "", "任务一");
    const counts = service.reindexAll();
    expect(counts.notes).toBe(1);
    expect(counts.tasks).toBe(1);
    database.close();
  });
});
