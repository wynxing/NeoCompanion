import { describe, expect, it } from "vitest";
import type { KnowledgeSource } from "@neo-companion/shared";
import { fuseRrf } from "./rrf";

function src(sourceType: "note" | "task", sourceId: string, projectId = "p"): KnowledgeSource {
  return { sourceType, sourceId, projectId, title: sourceId, excerpt: "", chunkId: sourceId };
}

describe("fuseRrf", () => {
  it("returns empty for two empty lists", () => {
    expect(fuseRrf([], [])).toEqual([]);
  });

  it("fuses two non-overlapping ranked lists", () => {
    const fts = [src("note", "a"), src("note", "b")];
    const knn = [src("note", "c"), src("note", "d")];
    const out = fuseRrf(fts, knn);
    expect(out.map((s) => s.sourceId)).toEqual(["a", "c", "b", "d"]);
  });

  it("boosts sources appearing in both lists (a wins over c)", () => {
    const fts = [src("note", "a"), src("note", "b")];
    const knn = [src("note", "c"), src("note", "a")]; // a appears in both
    const out = fuseRrf(fts, knn);
    // a: 1/61 + 1/62 ≈ 0.0325 ; c: 1/61 ≈ 0.0164 ; b: 1/62 ≈ 0.0161
    expect(out[0].sourceId).toBe("a");
    expect(out.map((s) => s.sourceId)).toEqual(["a", "c", "b"]);
  });

  it("dedups by source across lists (keeps the fused entry once)", () => {
    const fts = [src("note", "a")];
    const knn = [src("note", "a")];
    const out = fuseRrf(fts, knn);
    expect(out).toHaveLength(1);
    expect(out[0].sourceId).toBe("a");
  });

  it("distinguishes note vs task with same id", () => {
    const fts = [src("note", "x")];
    const knn = [src("task", "x")];
    const out = fuseRrf(fts, knn);
    expect(out).toHaveLength(2);
  });

  it("respects custom k", () => {
    const fts = [src("note", "a")];
    const knn = [src("note", "b")];
    const outK1 = fuseRrf(fts, knn, 1);
    const outK60 = fuseRrf(fts, knn, 60);
    // ordering identical here, but scores differ; just ensure no throw + length
    expect(outK1).toHaveLength(2);
    expect(outK60).toHaveLength(2);
  });
});
