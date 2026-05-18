/**
 * Integration tests for neighbor-window expansion in retrieve().
 *
 * Gated on RUN_INTEGRATION; needs a real Postgres + Qdrant and loads the
 * embedding + reranker models to ingest a multi-chunk fixture document.
 */
import { afterAll, beforeAll, describe, it, expect } from 'vitest';

const ENABLED = !!process.env.RUN_INTEGRATION;
const d = ENABLED ? describe : describe.skip;

d('retrieve() neighbor expansion', () => {
  let kbId: string;
  let chunks: string[];
  let hitIndex: number;
  const MARKER = '紫罗兰星球漫游记';

  beforeAll(async () => {
    const { config } = await import('../config.js');
    const { createKnowledgeBase } = await import('../services/kb.js');
    const { ingestDocument } = await import('../services/ingestion.js');
    const { recursiveSplit } = await import('../services/splitter.js');
    const { loadEmbedding } = await import('../services/embedding.js');
    const { loadReranker } = await import('../services/reranker.js');
    await Promise.all([loadEmbedding(), loadReranker()]);

    expect(config.RETRIEVE_WINDOW_SIZE).toBeGreaterThan(0);

    // Build a long document with many distinct paragraphs separated by \n\n
    // so the recursive splitter produces multiple chunks at sentence boundary.
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(
        `这是第${i}段填充内容，包含足够多的中文字符以让分块器把它当作一个独立的语义片段，避免被合并进相邻段落。`,
      );
    }
    const targetLine = 30;
    lines[targetLine] = `${MARKER}：这是第${targetLine}段的关键内容，应当被向量与关键词同时命中。`;
    const text = lines.join('\n\n');

    chunks = recursiveSplit(text, { chunkSize: config.CHUNK_SIZE, overlap: config.CHUNK_OVERLAP });
    expect(chunks.length).toBeGreaterThan(2);
    hitIndex = chunks.findIndex((c) => c.includes(MARKER));
    expect(hitIndex).toBeGreaterThan(0);
    expect(hitIndex).toBeLessThan(chunks.length - 1);

    const kb = await createKnowledgeBase(`itest-neighbor-${Date.now()}`, null);
    kbId = kb.id;
    await ingestDocument({
      kbId,
      filename: 'neighbor.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
  }, 5 * 60_000);

  afterAll(async () => {
    const { deleteKnowledgeBase } = await import('../services/kb.js');
    if (kbId) await deleteKnowledgeBase(kbId);
  });

  it('returns a context window covering the hit and its neighbors', async () => {
    const { retrieve } = await import('../services/retrieval.js');
    const { config } = await import('../config.js');
    const r = await retrieve({ kbId, query: MARKER, topK: 3, vectorK: 10, keywordK: 10 });
    expect(r.length).toBeGreaterThan(0);

    const top = r[0];
    expect(top.content).toContain(MARKER);
    expect(top.context).toContain(MARKER);

    // context should be strictly larger than the hit content and should
    // include text from at least one of the adjacent chunks.
    expect(top.context.length).toBeGreaterThan(top.content.length);
    const before = chunks[hitIndex - 1];
    const after = chunks[hitIndex + 1];
    const includesNeighbor =
      top.context.includes(before.slice(0, 20)) || top.context.includes(after.slice(0, 20));
    expect(includesNeighbor).toBe(true);

    // sanity: returned object still carries chunk-level metadata
    expect(top.chunk_id).toBeTruthy();
    expect(top.document_filename).toBe('neighbor.txt');
    void config;
  });

  it('falls back to content when window expansion finds nothing extra', async () => {
    const { ingestDocument } = await import('../services/ingestion.js');
    const { retrieve } = await import('../services/retrieval.js');
    // Single-chunk document: neighbors don't exist, context should equal content.
    await ingestDocument({
      kbId,
      filename: 'single.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('独立短文档，只有一个块。包含唯一关键词：孤岛灯塔。'),
    });
    const r = await retrieve({ kbId, query: '孤岛灯塔', topK: 1, vectorK: 5, keywordK: 5 });
    expect(r.length).toBeGreaterThan(0);
    const hit = r.find((c) => c.document_filename === 'single.txt');
    expect(hit).toBeDefined();
    expect(hit!.context).toBe(hit!.content);
  });
});
