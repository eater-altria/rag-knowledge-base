/**
 * HTTP-level tests for the document preview endpoint.
 *
 * Gated on RUN_INTEGRATION because they need real Postgres + Qdrant and
 * load the embedding model to ingest a fixture document.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';

const ENABLED = !!process.env.RUN_INTEGRATION;
const d = ENABLED ? describe : describe.skip;

d('GET /api/admin/kb/:id/documents/:doc_id/preview', () => {
  let app: FastifyInstance;
  let kbId: string;
  let docId: string;
  let chunks: string[];
  let token: string;

  beforeAll(async () => {
    const Fastify = (await import('fastify')).default;
    const jwt = (await import('@fastify/jwt')).default;
    const { config } = await import('../config.js');
    const { documentRoutes } = await import('../routes/documents.js');
    const { createKnowledgeBase } = await import('../services/kb.js');
    const { ingestDocument } = await import('../services/ingestion.js');
    const { recursiveSplit } = await import('../services/splitter.js');
    const { loadEmbedding } = await import('../services/embedding.js');
    await loadEmbedding();

    const kb = await createKnowledgeBase(`itest-preview-${Date.now()}`, null);
    kbId = kb.id;

    const body = '第一句。'.repeat(800);
    const res = await ingestDocument({ kbId, filename: 'preview.txt', mimeType: 'text/plain', buffer: Buffer.from(body) });
    docId = res.document_id;
    chunks = recursiveSplit(body, { chunkSize: config.CHUNK_SIZE, overlap: config.CHUNK_OVERLAP });
    expect(chunks.length).toBeGreaterThan(2);

    app = Fastify();
    await app.register(jwt, { secret: config.JWT_SECRET });
    await app.register(documentRoutes);
    await app.ready();
    token = app.jwt.sign({ sub: 'test-admin', username: 'test' });
  }, 5 * 60_000);

  afterAll(async () => {
    const { deleteKnowledgeBase } = await import('../services/kb.js');
    if (kbId) await deleteKnowledgeBase(kbId);
    if (app) await app.close();
  });

  it('returns 401 without a token', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/admin/kb/${kbId}/documents/${docId}/preview` });
    expect(r.statusCode).toBe(401);
  });

  it('returns chunk-joined text with pagination metadata', async () => {
    const limit = Math.max(1, Math.floor(chunks.length / 2));
    const r = await app.inject({
      method: 'GET',
      url: `/api/admin/kb/${kbId}/documents/${docId}/preview?limit=${limit}&offset=0`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.total_chunks).toBe(chunks.length);
    expect(body.returned_chunks).toBe(limit);
    expect(body.truncated).toBe(true);
    expect(body.next_offset).toBe(limit);
    expect(body.text).toBe(chunks.slice(0, limit).join('\n\n'));
  });

  it('rejects limit above 200', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/admin/kb/${kbId}/documents/${docId}/preview?limit=201`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: 'invalid_request' });
  });

  it('returns 404 for unknown document', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/api/admin/kb/${kbId}/documents/00000000-0000-0000-0000-000000000000/preview`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: 'document_not_found' });
  });
});
