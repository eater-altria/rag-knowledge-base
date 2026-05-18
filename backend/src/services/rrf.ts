/**
 * Reciprocal Rank Fusion: combine several ranked lists into a single
 * score-ordered list. For an item appearing at rank `i` (1-indexed) in
 * list `l`, its contribution is `1 / (k + i)`. Final score is the sum of
 * contributions across all lists the item appears in.
 *
 * Constant `k=60` follows the original paper (Cormack et al. 2009) and
 * has held up as a robust default across many benchmarks.
 */

export type FusionHit = {
  chunk_id: string;
  document_id: string;
};

export type FusionSource = 'vector' | 'keyword';

export type FusionList = {
  name: FusionSource;
  hits: FusionHit[];
};

export type FusedResult = {
  chunk_id: string;
  document_id: string;
  sources: Set<FusionSource>;
  rrf_score: number;
};

export function reciprocalRankFusion(lists: FusionList[], k = 60): FusedResult[] {
  const merged = new Map<string, FusedResult>();
  for (const list of lists) {
    for (let i = 0; i < list.hits.length; i++) {
      const h = list.hits[i];
      const cur = merged.get(h.chunk_id) ?? {
        chunk_id: h.chunk_id,
        document_id: h.document_id,
        sources: new Set<FusionSource>(),
        rrf_score: 0,
      };
      cur.sources.add(list.name);
      cur.rrf_score += 1 / (k + i + 1);
      merged.set(h.chunk_id, cur);
    }
  }
  return [...merged.values()].sort((a, b) => b.rrf_score - a.rrf_score);
}
