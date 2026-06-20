import { describe, expect, it } from "vitest";
import { chunkMarkdown, chunkTask, estimateTokens, hashContent, resolveChunkingConfig } from "./chunker";

describe("chunker", () => {
  it("estimates tokens as ~chars/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("".padEnd(400, "x"))).toBe(100);
  });

  it("hashes content deterministically", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
    expect(hashContent("hello")).not.toBe(hashContent("world"));
  });

  it("keeps headers with their section bodies", () => {
    const md = "# Title\n\nintro\n\n## Section A\n\nbody A\n\n## Section B\n\nbody B";
    const chunks = chunkMarkdown(md, { chunkSize: 400, chunkOverlap: 0, minChunkSize: 1 });
    // each section becomes one chunk, heading prefixed
    const joined = chunks.map((c) => c.content).join("\n---\n");
    expect(joined).toContain("# Title");
    expect(joined).toContain("## Section A");
    expect(joined).toContain("body B");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("drops chunks below min size", () => {
    const md = "# A\n\nx\n\n# B\n\n" + "y".repeat(40);
    const chunks = chunkMarkdown(md, { chunkSize: 400, chunkOverlap: 0, minChunkSize: 5 });
    // the "x" section (1 token) should be filtered
    expect(chunks.every((c) => estimateTokens(c.content) >= 5)).toBe(true);
  });

  it("splits over-long sections with overlap", () => {
    const long = "# Big\n\n" + "word ".repeat(2000); // ~10000 chars, ~2500 tokens
    const chunks = chunkMarkdown(long, { chunkSize: 100, chunkOverlap: 20, minChunkSize: 1 });
    expect(chunks.length).toBeGreaterThan(1);
    // every chunk should stay near the budget; overlap lets a chunk carry a
    // tail from the previous one plus a separator, so allow slack.
    for (const c of chunks) {
      expect(estimateTokens(c.content)).toBeLessThanOrEqual(160);
    }
  });

  it("assigns sequential ordinals and unique hashes", () => {
    const md = "# A\n\nalpha\n\n# B\n\nbeta";
    const chunks = chunkMarkdown(md, { chunkSize: 400, chunkOverlap: 0, minChunkSize: 1 });
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
    const hashes = chunks.map((c) => c.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("chunks a task as a single block", () => {
    const chunks = chunkTask("实现 RRF", "用 k=60 融合", { chunkSize: 400, chunkOverlap: 0, minChunkSize: 1 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("实现 RRF");
    expect(chunks[0].content).toContain("k=60");
  });

  it("returns no chunk for empty/too-small tasks", () => {
    expect(chunkTask("", undefined)).toEqual([]);
    expect(chunkTask("x", undefined, { chunkSize: 400, chunkOverlap: 0, minChunkSize: 5 })).toEqual([]);
  });

  it("respects env-configured sizes with safe clamping", () => {
    const orig = { ...process.env };
    process.env.NEO_CHUNK_SIZE = "200";
    process.env.NEO_CHUNK_OVERLAP = "10";
    process.env.NEO_MIN_CHUNK_SIZE = "2";
    const cfg = resolveChunkingConfig();
    expect(cfg.chunkSize).toBe(200);
    expect(cfg.chunkOverlap).toBe(10);
    expect(cfg.minChunkSize).toBe(2);
    process.env = orig;
  });

  it("clamps overlap below chunk size", () => {
    const orig = { ...process.env };
    process.env.NEO_CHUNK_SIZE = "200";
    process.env.NEO_CHUNK_OVERLAP = "500"; // invalid, falls back to 15%
    const cfg = resolveChunkingConfig();
    expect(cfg.chunkOverlap).toBeLessThan(cfg.chunkSize);
    process.env = orig;
  });
});
