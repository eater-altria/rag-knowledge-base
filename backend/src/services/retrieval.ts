import { pool } from '../db/pg.js';
import { embedQuery } from './embedding.js';
import { rerank } from './reranker.js';
import { searchPoints, type VectorHit } from '../qdrant/client.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { reciprocalRankFusion } from './rrf.js';

export type RetrieveInput = {
  kbId: string;
  query: string;
  topK: number;
  vectorK: number;
  keywordK: number;
};

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  kb_id: string;
  content: string;
  // Hit content joined with up to RETRIEVE_WINDOW_SIZE adjacent chunks from
  // the same document. Equal to `content` when the window is 0 or no
  // neighbors exist. Feed this to an LLM; use `content` for highlight/display.
  context: string;
  document_filename: string;
  score: number;
  source: 'vector' | 'keyword' | 'both';
};

type KeywordHit = { chunk_id: string; document_id: string; score: number };

async function keywordSearch(kbId: string, query: string, limit: number): Promise<KeywordHit[]> {
  const r = await pool.query<KeywordHit>(
    `SELECT id AS chunk_id, document_id, ts_rank(tsv, plainto_tsquery('chinese_zh', $2)) AS score
     FROM chunks
     WHERE kb_id = $1 AND tsv @@ plainto_tsquery('chinese_zh', $2)
     ORDER BY score DESC
     LIMIT $3`,
    [kbId, query, limit],
  );
  return r.rows.map((row) => ({ ...row, score: Number(row.score) }));
}

async function vectorSearch(kbId: string, query: string, limit: number): Promise<VectorHit[]> {
  const vec = await embedQuery(query);
  return searchPoints(kbId, vec, limit);
}

type HitForExpansion = { chunk_id: string; document_id: string; chunk_index: number };

async function expandNeighbors(
  kbId: string,
  hits: HitForExpansion[],
  window: number,
): Promise<Map<string, string>> {
  const docIds: string[] = [];
  const indexes: number[] = [];
  for (const h of hits) {
    for (let i = h.chunk_index - window; i <= h.chunk_index + window; i++) {
      if (i < 0) continue;
      docIds.push(h.document_id);
      indexes.push(i);
    }
  }
  if (docIds.length === 0) return new Map();

  const rows = await pool.query<{ document_id: string; chunk_index: number; content: string }>(
    `SELECT c.document_id, c.chunk_index, c.content
     FROM chunks c
     JOIN unnest($1::uuid[], $2::int[]) AS w(document_id, chunk_index)
       ON w.document_id = c.document_id AND w.chunk_index = c.chunk_index
     WHERE c.kb_id = $3`,
    [docIds, indexes, kbId],
  );

  const byDoc = new Map<string, Map<number, string>>();
  for (const row of rows.rows) {
    let bucket = byDoc.get(row.document_id);
    if (!bucket) {
      bucket = new Map();
      byDoc.set(row.document_id, bucket);
    }
    bucket.set(row.chunk_index, row.content);
  }

  const out = new Map<string, string>();
  for (const h of hits) {
    const doc = byDoc.get(h.document_id);
    if (!doc) continue;
    const parts: string[] = [];
    for (let i = h.chunk_index - window; i <= h.chunk_index + window; i++) {
      const c = doc.get(i);
      if (c !== undefined) parts.push(c);
    }
    if (parts.length > 0) out.set(h.chunk_id, parts.join('\n'));
  }
  return out;
}

export async function retrieve(input: RetrieveInput): Promise<RetrievedChunk[]> {
  const [vec, kw] = await Promise.all([
    vectorSearch(input.kbId, input.query, input.vectorK),
    keywordSearch(input.kbId, input.query, input.keywordK),
  ]);

  // RRF fuses the two ranked lists into a single rank-aware ordering, then
  // we truncate to RERANK_CANDIDATES so the cross-encoder workload is bounded
  // even when vector_k + keyword_k is large.
  const fused = reciprocalRankFusion([
    { name: 'vector', hits: vec },
    { name: 'keyword', hits: kw },
  ]);
  if (fused.length === 0) return [];
  const fusedTop = fused.slice(0, config.RERANK_CANDIDATES);
  const candidateIds = fusedTop.map((c) => c.chunk_id);
  const sourceByChunk = new Map(fusedTop.map((c) => [c.chunk_id, c.sources]));

  const rows = await pool.query<{
    id: string;
    document_id: string;
    kb_id: string;
    content: string;
    chunk_index: number;
    filename: string;
  }>(
    `SELECT c.id, c.document_id, c.kb_id, c.content, c.chunk_index, d.filename
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.id = ANY($1::uuid[]) AND c.kb_id = $2`,
    [candidateIds, input.kbId],
  );
  if (rows.rowCount === 0) return [];

  const scores = await rerank(input.query, rows.rows.map((r) => r.content));
  const scored = rows.rows.map((row, i) => {
    const sources = sourceByChunk.get(row.id) ?? new Set();
    const source: 'vector' | 'keyword' | 'both' =
      sources.size === 2 ? 'both' : sources.has('vector') ? 'vector' : 'keyword';
    return {
      chunk_id: row.id,
      document_id: row.document_id,
      kb_id: row.kb_id,
      content: row.content,
      chunk_index: row.chunk_index,
      document_filename: row.filename,
      score: scores[i],
      source,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, input.topK);

  const window = config.RETRIEVE_WINDOW_SIZE;
  const contextByChunk =
    window > 0 && top.length > 0
      ? await expandNeighbors(
          input.kbId,
          top.map((t) => ({ chunk_id: t.chunk_id, document_id: t.document_id, chunk_index: t.chunk_index })),
          window,
        )
      : new Map<string, string>();

  const out: RetrievedChunk[] = top.map((t) => ({
    chunk_id: t.chunk_id,
    document_id: t.document_id,
    kb_id: t.kb_id,
    content: t.content,
    context: contextByChunk.get(t.chunk_id) ?? t.content,
    document_filename: t.document_filename,
    score: t.score,
    source: t.source,
  }));

  logger.info(
    {
      kbId: input.kbId,
      fused: fused.length,
      reranked: scored.length,
      returned: out.length,
      window,
    },
    'retrieve done',
  );
  return out;
}
