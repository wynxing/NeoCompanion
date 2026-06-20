import { createHash } from "node:crypto";

/**
 * Markdown-aware chunking for the knowledge indexer (open-notebook port, point 2).
 *
 * Strategy:
 *   1. Split Markdown by H1/H2/H3 headers so each chunk respects semantic
 *      section boundaries (keeps a heading with its body).
 *   2. Recursively split any over-long section by paragraph → sentence → char.
 *   3. Size budgets are TOKEN-level (~chars/4 heuristic, no tokenizer dep),
 *      with overlap so cross-boundary context isn't lost.
 *   4. Drop chunks below MIN_CHUNK_SIZE (avoids null/useless embeddings and
 *      FTS noise from stray punctuation).
 *
 * Pure — no DB, no I/O. Unit-testable in isolation.
 */

export interface ChunkingConfig {
  /** Target chunk size in tokens. Default 400 (≈1600 chars). */
  chunkSize: number;
  /** Overlap between adjacent chunks in tokens. Default 15% of chunkSize. */
  chunkOverlap: number;
  /** Chunks below this token count are dropped. Default 5. */
  minChunkSize: number;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSize: 400,
  chunkOverlap: 60,
  minChunkSize: 5
};

export function resolveChunkingConfig(overrides?: Partial<ChunkingConfig>): ChunkingConfig {
  const env = process.env;
  const chunkSize = parsePositiveInt(env.NEO_CHUNK_SIZE, DEFAULT_CHUNKING_CONFIG.chunkSize);
  const overlap = parseNonNegativeInt(env.NEO_CHUNK_OVERLAP, Math.floor(chunkSize * 0.15));
  const minChunkSize = parseNonNegativeInt(env.NEO_MIN_CHUNK_SIZE, DEFAULT_CHUNKING_CONFIG.minChunkSize);
  return {
    chunkSize,
    chunkOverlap: overlap >= chunkSize ? Math.floor(chunkSize * 0.15) : overlap,
    minChunkSize,
    ...overrides
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 100 ? n : fallback;
}
function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Rough token estimate: ~4 chars/token, rounded up. Good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const HEADER_RE = /^(#{1,3})\s+(.*)$/;

export interface Chunk {
  content: string;
  ordinal: number;
  contentHash: string;
}

/**
 * Split Markdown text into chunks. Each chunk keeps its section heading as a
 * prefix so the chunk is self-describing for retrieval.
 */
export function chunkMarkdown(text: string, config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG): Chunk[] {
  const sections = splitByHeaders(text);
  const raw: string[] = [];
  for (const section of sections) {
    if (estimateTokens(section) <= config.chunkSize) {
      raw.push(section);
    } else {
      raw.push(...recursiveSplit(section, config.chunkSize, config.chunkOverlap));
    }
  }

  const chunks: Chunk[] = [];
  let ordinal = 0;
  for (const piece of raw) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if (estimateTokens(trimmed) < config.minChunkSize) continue;
    chunks.push({
      content: trimmed,
      ordinal,
      contentHash: hashContent(trimmed)
    });
    ordinal += 1;
  }
  return chunks;
}

/** Chunk a task (title + optional description) as a single block. */
export function chunkTask(title: string, description: string | undefined, config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG): Chunk[] {
  const body = description ? `${title}\n\n${description}` : title;
  const trimmed = body.trim();
  if (!trimmed || estimateTokens(trimmed) < config.minChunkSize) return [];
  return [{ content: trimmed, ordinal: 0, contentHash: hashContent(trimmed) }];
}

/** Split into header-bounded sections. Each section includes its heading line. */
function splitByHeaders(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const sections: string[] = [];
  let current: string[] = [];
  let currentHeading = "";

  const flush = () => {
    if (current.length) {
      sections.push([...currentHeading ? [currentHeading] : [], ...current].join("\n"));
    }
    current = [];
    currentHeading = "";
  };

  for (const line of lines) {
    if (HEADER_RE.test(line)) {
      flush();
      currentHeading = line;
    } else {
      current.push(line);
    }
  }
  flush();
  return sections;
}

/** Recursive character splitter: paragraph → sentence → word → char. */
function recursiveSplit(text: string, maxTokens: number, overlap: number): string[] {
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;
  if (text.length <= maxChars) return [text];

  const separators = ["\n\n", "\n", "。", ". ", "! ", "? ", " ", ""];
  return splitRecursive(text, maxChars, overlapChars, separators, 0);
}

function splitRecursive(text: string, maxChars: number, overlapChars: number, separators: string[], depth: number): string[] {
  if (text.length <= maxChars) return [text];
  if (depth >= separators.length) {
    // last resort: hard char slice with overlap
    return hardSlice(text, maxChars, overlapChars);
  }
  const sep = separators[depth];
  if (sep === "") return hardSlice(text, maxChars, overlapChars);

  const parts = text.split(sep);
  if (parts.length <= 1) return splitRecursive(text, maxChars, overlapChars, separators, depth + 1);

  const chunks: string[] = [];
  let buffer = "";
  for (const part of parts) {
    const candidate = buffer ? buffer + sep + part : part;
    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      if (buffer) chunks.push(buffer);
      if (part.length > maxChars) {
        chunks.push(...splitRecursive(part, maxChars, overlapChars, separators, depth + 1));
        buffer = "";
      } else {
        buffer = part;
      }
    }
  }
  if (buffer) chunks.push(buffer);

  // re-add overlap between chunks at this level
  return addOverlap(chunks, sep, overlapChars);
}

function addOverlap(chunks: string[], sep: string, overlapChars: number): string[] {
  if (chunks.length <= 1 || overlapChars <= 0) return chunks;
  const result: string[] = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const tail = prev.length > overlapChars ? prev.slice(-overlapChars) : prev;
    result.push(tail + sep + chunks[i]);
  }
  return result;
}

function hardSlice(text: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  const step = Math.max(1, maxChars - overlapChars);
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + maxChars));
    if (i + maxChars >= text.length) break;
  }
  return out;
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
