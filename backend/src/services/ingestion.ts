import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../db/pg.js';
import { ensureCollection, upsertPoints, deletePointsByDocument } from '../qdrant/client.js';
import { embeddingDim, embedTexts } from './embedding.js';
import { parseDocument, isSupported, UnsupportedFileTypeError } from './parser.js';
import { recursiveSplit } from './splitter.js';
import { config } from '../config.js';

export type IngestResult = { document_id: string; chunk_count: number };

export class TooManyChunksError extends Error {
  statusCode = 422;
  constructor(public chunks: number) {
    super('too_many_chunks');
  }
}

export async function ingestDocument(opts: {
  kbId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<IngestResult> {
  if (!isSupported(opts.filename)) {
    throw new UnsupportedFileTypeError(opts.filename);
  }
  const text = await parseDocument(opts.filename, opts.buffer);
  const chunks = recursiveSplit(text, {
    chunkSize: config.CHUNK_SIZE,
    overlap: config.CHUNK_OVERLAP,
  });
  if (chunks.length === 0) {
    throw new Error('document_empty');
  }
  if (chunks.length > config.MAX_CHUNKS_PER_DOC) {
    throw new TooManyChunksError(chunks.length);
  }

  await ensureCollection(opts.kbId, embeddingDim());

  // Embed first; if this fails we have not written anything to PG yet.
  const vectors = await embedTexts(chunks);

  const documentId = randomUUID();
  const chunkRows: { id: string; index: number; content: string; vector: number[] }[] = chunks.map((content, i) => ({
    id: randomUUID(),
    index: i,
    content,
    vector: vectors[i],
  }));

  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO documents (id, kb_id, filename, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5)',
      [documentId, opts.kbId, opts.filename, opts.mimeType, opts.buffer.length],
    );
    const insertText =
      'INSERT INTO chunks (id, document_id, kb_id, chunk_index, content) VALUES ' +
      chunkRows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ');
    const params: unknown[] = [];
    for (const row of chunkRows) {
      params.push(row.id, documentId, opts.kbId, row.index, row.content);
    }
    await client.query(insertText, params);
  });

  // Write to Qdrant after PG commit. If this fails, we manually compensate
  // by deleting the PG rows so no orphaned PG state remains.
  try {
    await upsertPoints(opts.kbId, chunkRows.map((r) => ({
      id: r.id,
      vector: r.vector,
      payload: { chunk_id: r.id, document_id: documentId, kb_id: opts.kbId },
    })));
  } catch (e) {
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);
    throw e;
  }

  return { document_id: documentId, chunk_count: chunkRows.length };
}

export async function listDocuments(kbId: string, limit: number, offset: number) {
  const items = await pool.query(
    `SELECT d.id, d.filename, d.mime_type, d.size_bytes, d.created_at,
            COALESCE(c.cnt, 0)::int AS chunk_count
     FROM documents d
     LEFT JOIN (SELECT document_id, COUNT(*) AS cnt FROM chunks GROUP BY document_id) c ON c.document_id = d.id
     WHERE d.kb_id = $1
     ORDER BY d.created_at DESC
     LIMIT $2 OFFSET $3`,
    [kbId, limit, offset],
  );
  const total = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM documents WHERE kb_id = $1', [kbId]);
  return { items: items.rows, total: Number(total.rows[0].count) };
}

export async function deleteDocument(kbId: string, documentId: string): Promise<boolean> {
  const r = await pool.query('SELECT 1 FROM documents WHERE id = $1 AND kb_id = $2', [documentId, kbId]);
  if (!r.rowCount) return false;
  await deletePointsByDocument(kbId, documentId);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM documents WHERE id = $1 AND kb_id = $2', [documentId, kbId]);
  });
  return true;
}
