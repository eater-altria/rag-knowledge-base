/**
 * HTTP-level tests for the document rename endpoint.
 * Gated on RUN_INTEGRATION; needs Postgres + Qdrant + embedding model.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';

const ENABLED = !!process.env.RUN_INTEGRATION;
const d = ENABLED ? describe : describe.skip;

d('PATCH /api/admin/kb/:id/documents/:doc_id', () => {
  let app: FastifyInstance;
  let kbId: string;
  let docId: string;
  let token: string;

  beforeAll(async () => {
    const Fastify = (await import('fastify')).default;
    const jwt = (await import('@fastify/jwt')).default;
    const { config } = await import('../config.js');
    const { documentRoutes } = await import('../routes/documents.js');
    const { createKnowledgeBase } = await import('../services/kb.js');
    const { ingestDocument } = await import('../services/ingestion.js');
    const { loadEmbedding } = await import('../services/embedding.js');
    const { loadReranker } = await import('../services/reranker.js');
    await Promise.all([loadEmbedding(), loadReranker()]);

    const kb = await createKnowledgeBase(`itest-rename-${Date.now()}`, null);
    kbId = kb.id;

    const res = await ingestDocument({
      kbId,
      filename: 'original.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Anthropic 发布了 Claude 4。'),
    });
    docId = res.document_id;

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

  async function patch(body: unknown, opts: { authed?: boolean; docId?: string } = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.authed !== false) headers.authorization = `Bearer ${token}`;
    return app.inject({
      method: 'PATCH',
      url: `/api/admin/kb/${kbId}/documents/${opts.docId ?? docId}`,
      payload: JSON.stringify(body),
      headers,
    });
  }

  it('rejects unauthenticated requests', async () => {
    const r = await patch({ filename: 'x.txt' }, { authed: false });
    expect(r.statusCode).toBe(401);
  });

  it('renames the document and surfaces it in list + retrieval', async () => {
    const newName = '新名字.txt';
    const r = await patch({ filename: newName });
    expect(r.statusCode).toBe(200);
    expect(r.json().filename).toBe(newName);

    const { listDocuments } = await import('../services/ingestion.js');
    const list = await listDocuments(kbId, 100, 0);
    expect(list.items.find((it: { id: string; filename: string }) => it.id === docId)?.filename).toBe(newName);

    const { retrieve } = await import('../services/retrieval.js');
    const hits = await retrieve({ kbId, query: 'Anthropic', topK: 5, vectorK: 10, keywordK: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.document_filename === newName)).toBe(true);
  });

  it.each([
    { name: 'empty after trim', filename: '   ' },
    { name: 'too long', filename: 'x'.repeat(256) },
    { name: 'contains slash', filename: 'foo/bar.txt' },
    { name: 'contains NUL', filename: 'foo\0bar.txt' },
  ])('rejects $name', async ({ filename }) => {
    const r = await patch({ filename });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ error: 'invalid_request' });
  });

  it('returns 404 for unknown document', async () => {
    const r = await patch({ filename: 'ok.txt' }, { docId: '00000000-0000-0000-0000-000000000000' });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: 'document_not_found' });
  });
});
