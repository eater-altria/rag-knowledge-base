import { pool } from '../db/pg.js';
import { embedQuery } from './embedding.js';
import { rerank } from './reranker.js';
import { searchPoints, type VectorHit } from '../qdrant/client.js';
import { logger } from '../logger.js';

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

export async function retrieve(input: RetrieveInput): Promise<RetrievedChunk[]> {
  const [vec, kw] = await Promise.all([
    vectorSearch(input.kbId, input.query, input.vectorK),
    keywordSearch(input.kbId, input.query, input.keywordK),
  ]);

  const merged = new Map<string, { document_id: string; sources: Set<'vector' | 'keyword'> }>();
  for (const h of vec) {
    const cur = merged.get(h.chunk_id) ?? { document_id: h.document_id, sources: new Set() };
    cur.sources.add('vector');
    merged.set(h.chunk_id, cur);
  }
  for (const h of kw) {
    const cur = merged.get(h.chunk_id) ?? { document_id: h.document_id, sources: new Set() };
    cur.sources.add('keyword');
    merged.set(h.chunk_id, cur);
  }
  const candidateIds = [...merged.keys()];
  if (candidateIds.length === 0) return [];

  const rows = await pool.query<{ id: string; document_id: string; kb_id: string; content: string; filename: string }>(
    `SELECT c.id, c.document_id, c.kb_id, c.content, d.filename
     FROM chunks c JOIN documents d ON d.id = c.document_id
     WHERE c.id = ANY($1::uuid[]) AND c.kb_id = $2`,
    [candidateIds, input.kbId],
  );
  if (rows.rowCount === 0) return [];

  const scores = await rerank(input.query, rows.rows.map((r) => r.content));
  const scored: RetrievedChunk[] = rows.rows.map((row, i) => {
    const sources = merged.get(row.id)?.sources ?? new Set();
    const source: 'vector' | 'keyword' | 'both' = sources.size === 2 ? 'both' : (sources.has('vector') ? 'vector' : 'keyword');
    return {
      chunk_id: row.id,
      document_id: row.document_id,
      kb_id: row.kb_id,
      content: row.content,
      document_filename: row.filename,
      score: scores[i],
      source,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, input.topK);
  logger.info({ kbId: input.kbId, candidates: scored.length, returned: top.length }, 'retrieve done');
  return top;
}
