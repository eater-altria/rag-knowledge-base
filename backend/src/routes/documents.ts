import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../middleware/jwt.js';
import { getKnowledgeBase } from '../services/kb.js';
import { deleteDocument, ingestDocument, listDocuments, TooManyChunksError } from '../services/ingestion.js';
import { UnsupportedFileTypeError } from '../services/parser.js';
import { logger } from '../logger.js';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function documentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/api/admin/kb/:id/documents',
    async (req, reply) => {
      const kb = await getKnowledgeBase(req.params.id);
      if (!kb) return reply.code(404).send({ error: 'kb_not_found' });
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
      const result = await listDocuments(req.params.id, parsed.data.limit, parsed.data.offset);
      reply.send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/kb/:id/documents',
    async (req, reply) => {
      const kb = await getKnowledgeBase(req.params.id);
      if (!kb) return reply.code(404).send({ error: 'kb_not_found' });
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'missing_file' });
      const buf = await file.toBuffer();
      try {
        const result = await ingestDocument({
          kbId: req.params.id,
          filename: file.filename,
          mimeType: file.mimetype,
          buffer: buf,
        });
        reply.code(201).send(result);
      } catch (e) {
        const err = e as { statusCode?: number; chunks?: number; message?: string };
        if (e instanceof UnsupportedFileTypeError) return reply.code(415).send({ error: 'unsupported_file_type' });
        if (e instanceof TooManyChunksError) return reply.code(422).send({ error: 'too_many_chunks', chunks: err.chunks });
        if (err.message === 'document_empty') return reply.code(422).send({ error: 'document_empty' });
        logger.error({ err: e, kbId: req.params.id }, 'ingestion failed');
        return reply.code(500).send({ error: 'ingestion_failed', reason: err.message });
      }
    },
  );

  app.delete<{ Params: { id: string; doc_id: string } }>(
    '/api/admin/kb/:id/documents/:doc_id',
    async (req, reply) => {
      const ok = await deleteDocument(req.params.id, req.params.doc_id);
      if (!ok) return reply.code(404).send({ error: 'document_not_found' });
      reply.code(204).send();
    },
  );

  // Batch upload — accepts multiple `file` parts in one multipart request,
  // processes them sequentially (embedding model is single-instance CPU-bound,
  // parallel ingestion would only thrash). Returns a per-file summary.
  app.post<{ Params: { id: string } }>(
    '/api/admin/kb/:id/documents/batch',
    async (req, reply) => {
      const kb = await getKnowledgeBase(req.params.id);
      if (!kb) return reply.code(404).send({ error: 'kb_not_found' });

      const uploaded: { filename: string; document_id: string; chunk_count: number }[] = [];
      const failed: { filename: string; error: string; reason?: string }[] = [];

      const parts = req.files({ limits: { files: 200 } });
      for await (const part of parts) {
        const filename = part.filename;
        try {
          const buf = await part.toBuffer();
          const result = await ingestDocument({
            kbId: req.params.id,
            filename,
            mimeType: part.mimetype,
            buffer: buf,
          });
          uploaded.push({ filename, ...result });
        } catch (e) {
          const err = e as { message?: string; chunks?: number };
          if (e instanceof UnsupportedFileTypeError) failed.push({ filename, error: 'unsupported_file_type' });
          else if (e instanceof TooManyChunksError) failed.push({ filename, error: 'too_many_chunks', reason: String(err.chunks) });
          else if (err.message === 'document_empty') failed.push({ filename, error: 'document_empty' });
          else {
            logger.error({ err: e, kbId: req.params.id, filename }, 'batch ingest failed');
            failed.push({ filename, error: 'ingestion_failed', reason: err.message });
          }
        }
      }

      reply.code(uploaded.length > 0 ? 200 : 422).send({ uploaded, failed });
    },
  );
}
