import { describe, expect, it } from "vitest";
import type { ContextLevel, KnowledgeNote, KnowledgeTask } from "@neo-companion/shared";
import { buildAskBlocks, buildChatBlocks, estimateTokens, packContext, summarizeNote, WEIGHTS, type ContextBlock } from "./context";

function note(id: string, title: string, body: string): KnowledgeNote {
  return { id, projectId: "p", title, body, tags: [], createdAt: 0, updatedAt: 0 };
}

describe("context assembly", () => {
  it("uses full retrieved chunk content for Ask blocks", () => {
    const source = { sourceType: "note" as const, sourceId: "n1", projectId: "p1", title: "T", excerpt: "short", chunkId: "c1" };
    const blocks = buildAskBlocks([source], new Map([["c1", "full chunk content"]]));
    expect(blocks[0].content).toBe("full chunk content");
  });
  it("summarizes a note to its first section", () => {
    const n = note("n1", "标题", "首段内容。\n\n## 第二节\n更多内容。");
    expect(summarizeNote(n)).toBe("首段内容。");
  });

  it("builds chat blocks with full/summary/excluded levels and weights", () => {
    const full = note("n1", "F", "full body");
    const summ = note("n2", "S", "summary body");
    const excluded = note("n3", "X", "excluded body");
    const blocks = buildChatBlocks(
      [
        { note: full, level: "full" },
        { note: summ, level: "summary" },
        { note: excluded, level: "excluded" }
      ],
      [],
      []
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].weight).toBe(WEIGHTS.noteFull);
    expect(blocks[1].weight).toBe(WEIGHTS.noteSummary);
    expect(blocks[1].content).toContain("summary body"); // summary keeps body when short
  });

  it("greedy-fills within budget and drops blocks that don't fit", () => {
    const big: ContextBlock = { type: "note", ref: "big", content: "x".repeat(400), weight: 100, ordinal: 0 };
    const small: ContextBlock = { type: "note", ref: "small", content: "y".repeat(40), weight: 50, ordinal: 1 };
    const packed = packContext([big, small], 200); // budget ~200 tokens ≈ 800 chars
    // big is 400 chars ≈ 100 tokens, fits; small 40 chars ≈ 10 tokens, fits
    expect(packed.usedRefs.has("big")).toBe(true);
    expect(packed.usedRefs.has("small")).toBe(true);
  });

  it("gap-fills a truncated slice when a block cannot fit whole", () => {
    const huge: ContextBlock = {
      type: "note", ref: "huge",
      content: "第一句。第二句。第三句。第四句。第五句。第六句。第七句。第八句。第九句。第十句。",
      weight: 100, ordinal: 0
    };
    const tiny: ContextBlock = { type: "note", ref: "tiny", content: "小", weight: 90, ordinal: 1 };
    // huge ≈ 10 tokens, tiny ≈ 1 token; budget 9 → tiny fits, huge skipped then gap-filled
    const packed = packContext([huge, tiny], 9);
    expect(packed.usedRefs.has("tiny")).toBe(true);
    expect(packed.usedRefs.has("huge")).toBe(true);
    const hugeBlock = packed.ordered.find((b) => b.ref === "huge");
    expect(hugeBlock?.content.length).toBeLessThan(huge.content.length);
  });

  it("sandwich-orders: highest weight first", () => {
    const low: ContextBlock = { type: "message", ref: "m1", content: "low", weight: 40, ordinal: 0 };
    const high: ContextBlock = { type: "note", ref: "n1", content: "high", weight: 100, ordinal: 1 };
    const mid: ContextBlock = { type: "task", ref: "t1", content: "mid", weight: 55, ordinal: 2 };
    const packed = packContext([low, high, mid], 1000);
    expect(packed.ordered[0].ref).toBe("n1"); // highest weight first
  });

  it("keeps same-source blocks in document order", () => {
    const a: ContextBlock = { type: "note", ref: "n1", content: "a", weight: 100, ordinal: 0 };
    const b: ContextBlock = { type: "note", ref: "n1", content: "b", weight: 100, ordinal: 1 };
    const packed = packContext([a, b], 1000);
    const refs = packed.ordered.map((x) => x.content);
    expect(refs).toEqual(["a", "b"]);
  });

  it("estimateTokens ≈ chars/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});
