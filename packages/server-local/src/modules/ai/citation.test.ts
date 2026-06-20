import { describe, expect, it } from "vitest";
import type { KnowledgeSource } from "@neo-companion/shared";
import { injectSources, parseAndAuditCitations, buildSources } from "./citation";
import type { ContextBlock } from "./context";

function block(ref: string, content: string, ordinal = 0): ContextBlock {
  return { type: "note", ref, content, weight: 100, ordinal };
}

function source(ref: string): KnowledgeSource {
  return { sourceType: "note", sourceId: ref, projectId: "p", title: ref, excerpt: "", chunkId: ref };
}

describe("citation injection + audit", () => {
  it("assigns stable ids s0..sN and renders source elements", () => {
    const injected = injectSources([block("n1", "内容一"), block("n2", "内容二")]);
    expect(injected.idToRef.get("s0")).toBe("n1");
    expect(injected.idToRef.get("s1")).toBe("n2");
    expect(injected.contextText).toContain('<source id="s0"');
    expect(injected.contextText).toContain("内容一");
    expect(injected.systemPrompt).toContain("不得发明新 id");
  });

  it("keeps valid citations and drops invented ids", () => {
    const valid = new Set(["s0", "s1"]);
    const text = "根据笔记 [s0] 和虚构的 [s9] 以及 (s1)。";
    const result = parseAndAuditCitations(text, valid);
    expect(result.citedIds).toEqual(["s0", "s1"]);
    expect(result.cleanedText).not.toContain("s9");
    expect(result.cleanedText).toContain("[s0]");
    expect(result.cleanedText).toContain("(s1)");
  });

  it("dedupes repeated citations in first-appearance order", () => {
    const valid = new Set(["s0", "s1"]);
    const result = parseAndAuditCitations("[s1][s0][s1]", valid);
    expect(result.citedIds).toEqual(["s1", "s0"]);
  });

  it("builds sources only for cited, injected blocks", () => {
    const injected = injectSources([block("n1", "a"), block("n2", "b")]);
    const lookup = new Map<string, KnowledgeSource>([["n1", source("n1")], ["n2", source("n2")]]);
    const sources = buildSources(injected, ["s0"], lookup);
    expect(sources).toHaveLength(1);
    expect(sources[0].sourceId).toBe("n1");
  });

  it("returns no sources when nothing is cited", () => {
    const injected = injectSources([block("n1", "a")]);
    const lookup = new Map([["n1", source("n1")]]);
    expect(buildSources(injected, [], lookup)).toEqual([]);
  });
});
