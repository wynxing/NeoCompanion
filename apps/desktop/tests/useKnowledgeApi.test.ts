import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKnowledgeApi } from "../src/composables/useKnowledgeApi";
import type { KnowledgeProject } from "../src/composables/useKnowledgeMock";

const API = "http://127.0.0.1:10103";

function jsonOnce(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    json: async () => body,
    text: async () => JSON.stringify(body)
  })) as unknown as typeof fetch;
}

const project: KnowledgeProject = {
  id: "p1", title: "产品研究", parentId: null, order: 0, createdAt: 1, updatedAt: 1
};

describe("useKnowledgeApi optimistic writes", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loadAll populates reactive collections from the API", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/knowledge/projects?root=1")) return (jsonOnce(200, [project])()) as unknown as Response;
      if (url.includes("/notes")) return (jsonOnce(200, [])()) as unknown as Response;
      if (url.includes("/columns")) return (jsonOnce(200, [])()) as unknown as Response;
      if (url.includes("/tasks")) return (jsonOnce(200, [])()) as unknown as Response;
      throw new Error(`unexpected ${url}`);
    });

    const ds = useKnowledgeApi();
    await ds.loadAll();
    expect(ds.projects.value).toHaveLength(1);
    expect(ds.projects.value[0].title).toBe("产品研究");
    expect(ds.ready.value).toBe(true);
    expect(ds.lastError.value).toBeNull();
  });

  it("loadAll failure sets lastError and rethrows for fallback", async () => {
    globalThis.fetch = jsonOnce(503, { error: "knowledge store unavailable (sqlite not loaded)" });
    const ds = useKnowledgeApi();
    await expect(ds.loadAll()).rejects.toThrow();
    expect(ds.ready.value).toBe(false);
    expect(ds.lastError.value).toBeTruthy();
  });

  it("createNote optimistically adds then reconciles with server id", async () => {
    // loadAll first
    let createCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/knowledge/projects?root=1")) return (jsonOnce(200, [project])()) as unknown as Response;
      if (url.includes("/notes") && init?.method === "POST") {
        createCalls += 1;
        return (jsonOnce(200, {
          id: "server-id", projectId: "p1", title: "RRF", body: "", tags: [], createdAt: 100, updatedAt: 100
        })()) as unknown as Response;
      }
      if (url.includes("/notes")) return (jsonOnce(200, [])()) as unknown as Response;
      if (url.includes("/columns")) return (jsonOnce(200, [])()) as unknown as Response;
      if (url.includes("/tasks")) return (jsonOnce(200, [])()) as unknown as Response;
      throw new Error(`unexpected ${url}`);
    });

    const ds = useKnowledgeApi();
    await ds.loadAll();

    const optimistic = ds.createNote("p1", "RRF");
    // optimistic object returned synchronously
    expect(optimistic.title).toBe("RRF");
    expect(ds.notes.value).toHaveLength(1);
    expect(ds.notes.value[0].id).toBe(optimistic.id); // optimistic id initially

    // let the API promise resolve and the .then reconcile run
    await vi.waitFor(() => expect(ds.notes.value[0].id).toBe("server-id"));
  });

  it("createNote rolls back on API failure and surfaces error", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/knowledge/projects?root=1")) return (jsonOnce(200, [project])()) as unknown as Response;
      if (url.includes("/notes") && init?.method === "POST") {
        return (jsonOnce(500, { error: "boom" })()) as unknown as Response;
      }
      if (url.includes("/notes")) return (jsonOnce(200, [])()) as unknown as Response;
      if (url.includes("/columns")) return (jsonOnce(200, [])()) as unknown as Response;
      if (url.includes("/tasks")) return (jsonOnce(200, [])()) as unknown as Response;
      throw new Error(`unexpected ${url}`);
    });

    const ds = useKnowledgeApi();
    await ds.loadAll();

    ds.createNote("p1", "doomed");
    expect(ds.notes.value).toHaveLength(1); // optimistic
    await vi.waitFor(() => expect(ds.notes.value).toHaveLength(0)); // rolled back
    expect(ds.lastError.value).toBeTruthy();
  });
});
