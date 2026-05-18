import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { getKnowledgeBase } from '../services/kb.js';
import { retrieve } from '../services/retrieval.js';

const schema = z.object({
  kb_id: z.string().uuid(),
  query: z.string().min(1).max(2000),
  top_k: z.number().int().min(1).max(50).default(10),
  vector_k: z.number().int().min(1).max(200).default(50),
  keyword_k: z.number().int().min(1).max(200).default(50),
});

export async function retrieveRoutes(app: FastifyInstance) {
  app.post('/api/retrieve', {
    config: {
      rateLimit: {
        max: config.RETRIEVE_RATE_PER_MIN,
        timeWindow: '1 minute',
      },
    },
  }, async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.issues });
    const kb = await getKnowledgeBase(parsed.data.kb_id);
    if (!kb) return reply.code(404).send({ error: 'kb_not_found' });
    const results = await retrieve({
      kbId: parsed.data.kb_id,
      query: parsed.data.query,
      topK: parsed.data.top_k,
      vectorK: parsed.data.vector_k,
      keywordK: parsed.data.keyword_k,
    });
    reply.send({ results });
  });
}
