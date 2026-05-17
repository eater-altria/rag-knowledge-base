import type { FastifyInstance } from 'fastify';
import { pgHealth } from '../db/pg.js';
import { qdrantHealth } from '../qdrant/client.js';
import { isEmbeddingReady } from '../services/embedding.js';
import { isRerankerReady } from '../services/reranker.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_req, reply) => {
    const [pg, qd] = await Promise.all([pgHealth(), qdrantHealth()]);
    const models = isEmbeddingReady() && isRerankerReady();
    const ok = pg && qd && models;
    reply.code(ok ? 200 : 503).send({
      ok,
      postgres: pg,
      qdrant: qd,
      models,
    });
  });
}
