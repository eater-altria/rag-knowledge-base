import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const qdrant = new QdrantClient({
  url: config.QDRANT_URL,
  apiKey: config.QDRANT_API_KEY,
});

export const collectionName = (kbId: string): string => `kb_${kbId.replace(/-/g, '_')}`;

export async function qdrantHealth(): Promise<boolean> {
  try {
    await qdrant.getCollections();
    return true;
  } catch (e) {
    logger.warn({ err: e }, 'qdrant health check failed');
    return false;
  }
}

export async function ensureCollection(kbId: string, dim: number): Promise<void> {
  const name = collectionName(kbId);
  const existing = await qdrant.getCollections();
  if (existing.collections.some((c) => c.name === name)) return;
  await qdrant.createCollection(name, {
    vectors: { size: dim, distance: 'Cosine' },
  });
}

export async function deleteCollection(kbId: string): Promise<void> {
  const name = collectionName(kbId);
  try {
    await qdrant.deleteCollection(name);
  } catch (e) {
    logger.warn({ err: e, kbId }, 'qdrant deleteCollection failed (continuing)');
  }
}

export type ChunkPoint = {
  id: string;
  vector: number[];
  payload: { chunk_id: string; document_id: string; kb_id: string };
};

export async function upsertPoints(kbId: string, points: ChunkPoint[]): Promise<void> {
  if (points.length === 0) return;
  await qdrant.upsert(collectionName(kbId), {
    wait: true,
    points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
  });
}

export type VectorHit = { chunk_id: string; document_id: string; score: number };

export async function searchPoints(
  kbId: string,
  vector: number[],
  limit: number,
): Promise<VectorHit[]> {
  const res = await qdrant.search(collectionName(kbId), {
    vector,
    limit,
    with_payload: true,
  });
  return res.map((h) => ({
    chunk_id: String((h.payload as { chunk_id: string }).chunk_id),
    document_id: String((h.payload as { document_id: string }).document_id),
    score: h.score,
  }));
}

export async function deletePointsByDocument(kbId: string, documentId: string): Promise<void> {
  await qdrant.delete(collectionName(kbId), {
    wait: true,
    filter: {
      must: [{ key: 'document_id', match: { value: documentId } }],
    },
  });
}
