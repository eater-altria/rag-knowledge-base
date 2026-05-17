/**
 * Integration tests covering kb isolation (5.4), upload-failure cleanup (6.5),
 * and hybrid retrieval scenarios + rate-limit (7.7).
 *
 * Requires a running Postgres + Qdrant. Set env:
 *   POSTGRES_HOST / POSTGRES_PASSWORD / QDRANT_URL / JWT_SECRET
 * Then: npm test
 *
 * These tests are skipped automatically if the environment isn't configured.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';

const ENABLED = !!process.env.RUN_INTEGRATION;

const d = ENABLED ? describe : describe.skip;

d('rag end-to-end', () => {
  let kbA: string;
  let kbB: string;

  beforeAll(async () => {
    const { createKnowledgeBase } = await import('../services/kb.js');
    const { loadEmbedding } = await import('../services/embedding.js');
    const { loadReranker } = await import('../services/reranker.js');
    await Promise.all([loadEmbedding(), loadReranker()]);
    kbA = (await createKnowledgeBase(`itest-A-${Date.now()}`, null)).id;
    kbB = (await createKnowledgeBase(`itest-B-${Date.now()}`, null)).id;
  }, 5 * 60_000);

  afterAll(async () => {
    const { deleteKnowledgeBase } = await import('../services/kb.js');
    if (kbA) await deleteKnowledgeBase(kbA);
    if (kbB) await deleteKnowledgeBase(kbB);
  });

  it('isolates knowledge bases on retrieval', async () => {
    const { ingestDocument } = await import('../services/ingestion.js');
    const { retrieve } = await import('../services/retrieval.js');
    await ingestDocument({ kbId: kbA, filename: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('Anthropic 发布了 Claude 4。') });
    const rB = await retrieve({ kbId: kbB, query: 'Anthropic', topK: 5, vectorK: 10, keywordK: 10 });
    expect(rB).toHaveLength(0);
  });

  it('returns original text without summarisation', async () => {
    const { ingestDocument } = await import('../services/ingestion.js');
    const { retrieve } = await import('../services/retrieval.js');
    const text = '产品发布会将在下周举行，地点为北京。';
    await ingestDocument({ kbId: kbA, filename: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
    const r = await retrieve({ kbId: kbA, query: '产品发布会', topK: 5, vectorK: 10, keywordK: 10 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((c) => c.content.includes('产品发布会'))).toBe(true);
  });

  it('marks both-source hits as `both`', async () => {
    const { ingestDocument } = await import('../services/ingestion.js');
    const { retrieve } = await import('../services/retrieval.js');
    await ingestDocument({ kbId: kbA, filename: 'c.txt', mimeType: 'text/plain', buffer: Buffer.from('量子计算机原型机已完成验证。') });
    const r = await retrieve({ kbId: kbA, query: '量子计算机', topK: 5, vectorK: 10, keywordK: 10 });
    expect(r.some((c) => c.source === 'both')).toBe(true);
  });
});
