import { pool, withTransaction } from '../db/pg.js';
import { ensureCollection, deleteCollection } from '../qdrant/client.js';
import { embeddingDim } from './embedding.js';

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type KnowledgeBaseWithStats = KnowledgeBase & {
  document_count: number;
  chunk_count: number;
};

export async function createKnowledgeBase(name: string, description: string | null): Promise<KnowledgeBase> {
  const existing = await pool.query('SELECT 1 FROM knowledge_bases WHERE name = $1', [name]);
  if (existing.rowCount && existing.rowCount > 0) {
    const err = new Error('kb_name_exists');
    (err as { statusCode?: number }).statusCode = 409;
    throw err;
  }
  const r = await pool.query<KnowledgeBase>(
    'INSERT INTO knowledge_bases (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
    [name, description],
  );
  const kb = r.rows[0];
  await ensureCollection(kb.id, embeddingDim());
  return kb;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseWithStats[]> {
  const r = await pool.query<KnowledgeBaseWithStats>(
    `SELECT k.id, k.name, k.description, k.created_at,
            COALESCE(d.cnt, 0)::int AS document_count,
            COALESCE(c.cnt, 0)::int AS chunk_count
     FROM knowledge_bases k
     LEFT JOIN (SELECT kb_id, COUNT(*) AS cnt FROM documents GROUP BY kb_id) d ON d.kb_id = k.id
     LEFT JOIN (SELECT kb_id, COUNT(*) AS cnt FROM chunks    GROUP BY kb_id) c ON c.kb_id = k.id
     ORDER BY k.created_at DESC`,
  );
  return r.rows;
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase | null> {
  const r = await pool.query<KnowledgeBase>(
    'SELECT id, name, description, created_at FROM knowledge_bases WHERE id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

export async function deleteKnowledgeBase(id: string): Promise<boolean> {
  const kb = await getKnowledgeBase(id);
  if (!kb) return false;
  // delete Qdrant first; PG cascade handles chunks + documents
  await deleteCollection(id);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM knowledge_bases WHERE id = $1', [id]);
  });
  return true;
}
