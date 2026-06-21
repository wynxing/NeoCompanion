import type { KnowledgeSource } from "@neo-companion/shared";
import type { ContextBlock } from "./context";

/**
 * Citation injection + audit (Phase 4). Each packed block becomes a
 * <source id="sN"> element in the prompt; the system prompt forbids inventing
 * ids. After the model replies, parseAndAuditCitations drops any citation id
 * the model produced that wasn't actually injected (anti-hallucination).
 */

export interface InjectedContext {
  systemPrompt: string;
  contextText: string;
  /** Map of injected id → block ref (noteId/taskId/messageId). */
  idToRef: Map<string, string>;
  /** Blocks in prompt order, with their assigned ids. */
  blocks: Array<ContextBlock & { id: string }>;
}

const SYSTEM_PROMPT = `你是 NeoCompanion 的知识助手。回答基于下方提供的 <source> 段落。
引用规则：
- 只能引用已提供的 source id（如 s0、s1），不得发明新 id。
- 引用标记放在相关句末，格式 [sN]；多个来源并列写作 [s0][s1]。
- 若上下文不足以回答，如实说明，不要编造来源。
回答简洁、具体。`;

/** Render packed blocks as <source> elements with stable ids s0..sN. */
export function injectSources(blocks: ContextBlock[]): InjectedContext {
  const idToRef = new Map<string, string>();
  const tagged: Array<ContextBlock & { id: string }> = [];
  const lines: string[] = [];

  blocks.forEach((block, index) => {
    const id = `s${index}`;
    idToRef.set(id, block.ref);
    tagged.push({ ...block, id });
    const typeLabel = block.type === "note" ? "笔记" : block.type === "task" ? "任务" : "历史";
    lines.push(`<source id="${id}" type="${typeLabel}" ref="${block.ref}">${block.content}</source>`);
  });

  return {
    systemPrompt: SYSTEM_PROMPT,
    contextText: lines.join("\n\n"),
    idToRef,
    blocks: tagged
  };
}

/** Match citation markers like [s0], (s1), or bare s0 at word boundaries. */
const CITATION_RE = /\[?(s\d+)\]?/g;

export interface AuditedCitations {
  /** Text with invalid citation markers removed. */
  cleanedText: string;
  /** Valid cited ids (subset of validIds), in first-appearance order, deduped. */
  citedIds: string[];
}

/** Extract citation ids, keep only those that were actually injected. */
export function parseAndAuditCitations(text: string, validIds: Set<string>): AuditedCitations {
  const cited: string[] = [];
  const seen = new Set<string>();
  const cleaned = text.replace(CITATION_RE, (full, id: string) => {
    if (validIds.has(id)) {
      if (!seen.has(id)) {
        cited.push(id);
        seen.add(id);
      }
      return full; // keep valid marker
    }
    return ""; // drop invented/unknown marker
  });
  return { cleanedText: cleaned, citedIds: cited };
}

/** Build the KnowledgeSource[] to return to the client, limited to cited blocks. */
export function buildSources(
  injected: InjectedContext,
  citedIds: string[],
  sourceLookup: Map<string, KnowledgeSource>
): KnowledgeSource[] {
  const out: KnowledgeSource[] = [];
  const seen = new Set<string>();
  for (const id of citedIds) {
    const ref = injected.idToRef.get(id);
    if (!ref) continue;
    const source = sourceLookup.get(ref);
    if (!source || seen.has(ref)) continue;
    seen.add(ref);
    out.push(source);
  }
  return out;
}
