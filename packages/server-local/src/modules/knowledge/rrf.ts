import type { KnowledgeSource } from "@neo-companion/shared";

/**
 * Reciprocal Rank Fusion (Cormack 2009, k=60). Fuses two ranked source lists
 * into one by summing `1/(k + rank)` per source; a source appearing in both
 * lists gets both contributions. Input lists are assumed already deduped per
 * source and ordered best-first (rank 1 = best).
 */
export function fuseRrf(
  ftsRanked: KnowledgeSource[],
  knnRanked: KnowledgeSource[],
  k = 60
): KnowledgeSource[] {
  const scores = new Map<string, { source: KnowledgeSource; score: number }>();

  const add = (list: KnowledgeSource[]): void => {
    list.forEach((source, index) => {
      const key = sourceKey(source);
      const contribution = 1 / (k + (index + 1));
      const existing = scores.get(key);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(key, { source, score: contribution });
      }
    });
  };

  add(ftsRanked);
  add(knnRanked);

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.source);
}

function sourceKey(s: KnowledgeSource): string {
  return `${s.sourceType}:${s.sourceId}`;
}
