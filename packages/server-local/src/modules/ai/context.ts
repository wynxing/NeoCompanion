import type { ContextLevel, KnowledgeNote, KnowledgeTask, KnowledgeSource } from "@neo-companion/shared";

/**
 * Context assembly for AI Chat/Ask (Phase 4, ported from open-notebook's
 * ContextBuilder). Pure functions: token-budget packing with priority weights,
 * greedy fill, gap fill at sentence boundaries, and sandwich ordering.
 */

export interface ContextBlock {
  /** Stable id used as the citation anchor, e.g. "s0". Assigned by injectSources. */
  id?: string;
  type: "note" | "task" | "message";
  ref: string; // noteId / taskId / messageId
  content: string;
  weight: number;
  /** Original document order within the same source (for stable sandwiching). */
  ordinal: number;
}

export interface PackedContext {
  /** Blocks in the order they should appear in the prompt (sandwich order). */
  ordered: ContextBlock[];
  /** Set of block refs actually included (after budget pruning). */
  usedRefs: Set<string>;
}

/** Priority weights (higher = more important to include). Tunable. */
export const WEIGHTS = {
  noteFull: 100,
  askChunk: 90,
  noteSummary: 70,
  task: 55,
  history: 40
} as const;

/** Rough token estimate (~chars/4 for mixed CJK/latin). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Summarize a note to its first heading section or leading characters. */
export function summarizeNote(note: KnowledgeNote, maxChars = 400): string {
  const body = note.body.trim();
  if (!body) return note.title;
  const firstSection = body.split(/\n#{2,}\s/)[0]?.trim() ?? body;
  if (firstSection.length <= maxChars) return firstSection;
  return `${firstSection.slice(0, maxChars - 1)}…`;
}

/** Build context blocks for Chat mode from selected notes/tasks + history. */
export function buildChatBlocks(
  notes: Array<{ note: KnowledgeNote; level: ContextLevel }>,
  tasks: Array<{ task: KnowledgeTask; level: ContextLevel }>,
  history: Array<{ role: "user" | "assistant"; content: string; id: string }> = []
): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  let ordinal = 0;
  for (const { note, level } of notes) {
    if (level === "excluded") continue;
    blocks.push({
      type: "note",
      ref: note.id,
      content: level === "summary" ? summarizeNote(note) : `${note.title}\n\n${note.body}`,
      weight: level === "summary" ? WEIGHTS.noteSummary : WEIGHTS.noteFull,
      ordinal: ordinal++
    });
  }
  for (const { task, level } of tasks) {
    if (level === "excluded") continue;
    const content = task.description ? `${task.title}\n\n${task.description}` : task.title;
    blocks.push({ type: "task", ref: task.id, content, weight: WEIGHTS.task, ordinal: ordinal++ });
  }
  history.forEach((m) => {
    blocks.push({
      type: "message",
      ref: m.id,
      content: m.content,
      weight: WEIGHTS.history,
      ordinal: ordinal++
    });
  });
  return blocks;
}

/** Build context blocks for Ask mode from retrieved chunks. */
export function buildAskBlocks(chunks: KnowledgeSource[], chunkContents: Map<string, string>): ContextBlock[] {
  return chunks.map((chunk, idx) => ({
    type: chunk.sourceType,
    ref: chunk.sourceId,
    content: chunkContents.get(chunk.chunkId) ?? chunk.excerpt,
    weight: WEIGHTS.askChunk,
    ordinal: idx
  }));
}

const SENTENCE_BOUNDARY = /[。！？\n.!?]/;

/** Truncate at the last sentence boundary fitting within remaining tokens. */
function truncateAtSentence(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  let lastBoundary = -1;
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    if (SENTENCE_BOUNDARY.test(slice[i])) {
      lastBoundary = i;
      break;
    }
  }
  return lastBoundary > 0 ? slice.slice(0, lastBoundary + 1) : slice;
}

/**
 * Pack blocks into a token budget:
 * 1. Greedy fill — sort by weight desc, take whole blocks while budget remains.
 * 2. Gap fill — for skipped high-weight blocks, try a sentence-truncated slice
 *    in remaining budget (partial > nothing).
 * 3. Sandwich order — highest weight first, lowest in the middle, second-highest
 *    last (LLMs attend to首尾); same-source blocks keep document order.
 */
export function packContext(blocks: ContextBlock[], budgetTokens: number): PackedContext {
  const byWeight = [...blocks].sort((a, b) => b.weight - a.weight || a.ordinal - b.ordinal);

  const included: ContextBlock[] = [];
  const usedRefs = new Set<string>();
  let remaining = budgetTokens;

  // Greedy fill
  const skipped: ContextBlock[] = [];
  for (const block of byWeight) {
    const cost = estimateTokens(block.content);
    if (cost <= remaining) {
      included.push(block);
      usedRefs.add(block.ref);
      remaining -= cost;
    } else {
      skipped.push(block);
    }
  }

  // Gap fill: truncated slices of skipped blocks
  for (const block of skipped) {
    if (remaining < 8) break;
    const truncated = truncateAtSentence(block.content, remaining);
    if (truncated.length < 16) continue;
    included.push({ ...block, content: truncated });
    usedRefs.add(block.ref);
    remaining -= estimateTokens(truncated);
  }

  // Sandwich order: highest weight first (LLMs attend to the start), with
  // same-weight blocks keeping document order so co-source chunks stay together.
  const sorted = [...included].sort((a, b) => b.weight - a.weight || a.ordinal - b.ordinal);

  return { ordered: sorted, usedRefs };
}
