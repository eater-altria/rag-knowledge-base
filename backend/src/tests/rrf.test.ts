import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../services/rrf.js';

const hit = (id: string, doc = 'd1') => ({ chunk_id: id, document_id: doc });

describe('reciprocalRankFusion', () => {
  it('ranks a single list by 1/(k+rank)', () => {
    const out = reciprocalRankFusion(
      [{ name: 'vector', hits: [hit('a'), hit('b'), hit('c')] }],
      60,
    );
    expect(out.map((r) => r.chunk_id)).toEqual(['a', 'b', 'c']);
    expect(out[0].rrf_score).toBeCloseTo(1 / 61, 8);
    expect(out[1].rrf_score).toBeCloseTo(1 / 62, 8);
    expect(out[0].sources).toEqual(new Set(['vector']));
  });

  it('sums contributions for items in multiple lists', () => {
    const out = reciprocalRankFusion(
      [
        { name: 'vector', hits: [hit('a'), hit('b'), hit('c')] },
        { name: 'keyword', hits: [hit('c'), hit('a'), hit('d')] },
      ],
      60,
    );
    const byId = new Map(out.map((r) => [r.chunk_id, r]));
    expect(byId.get('a')!.rrf_score).toBeCloseTo(1 / 61 + 1 / 62, 8);
    expect(byId.get('c')!.rrf_score).toBeCloseTo(1 / 63 + 1 / 61, 8);
    expect(byId.get('a')!.sources).toEqual(new Set(['vector', 'keyword']));
    expect(byId.get('d')!.sources).toEqual(new Set(['keyword']));
  });

  it('orders items found in both lists ahead of single-list items at the same rank', () => {
    const out = reciprocalRankFusion(
      [
        { name: 'vector', hits: [hit('only-v'), hit('both')] },
        { name: 'keyword', hits: [hit('only-k'), hit('both')] },
      ],
      60,
    );
    // "both" appears at rank 2 in both lists → 2 * 1/62
    // single-list items appear at rank 1 → 1/61
    // 2/62 ≈ 0.0323 > 1/61 ≈ 0.0164 → "both" should rank first
    expect(out[0].chunk_id).toBe('both');
  });

  it('preserves document_id from the first list that introduces the chunk', () => {
    const out = reciprocalRankFusion(
      [
        { name: 'vector', hits: [{ chunk_id: 'a', document_id: 'doc-x' }] },
        { name: 'keyword', hits: [{ chunk_id: 'a', document_id: 'doc-y' }] },
      ],
      60,
    );
    expect(out[0].document_id).toBe('doc-x');
  });

  it('handles empty input', () => {
    expect(reciprocalRankFusion([], 60)).toEqual([]);
    expect(reciprocalRankFusion([{ name: 'vector', hits: [] }], 60)).toEqual([]);
  });
});
