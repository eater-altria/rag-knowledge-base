import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../middleware/jwt.js';
import { createKnowledgeBase, deleteKnowledgeBase, getKnowledgeBase, listKnowledgeBases } from '../services/kb.js';

const createSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).nullable().optional(),
});

/** Public KB list — no auth required (used by /api/retrieve consumers and the MCP server). */
export async function publicKbRoutes(app: FastifyInstance) {
  app.get('/api/kb', async (_req, reply) => {
    const items = await listKnowledgeBases();
    reply.send(items);
  });
}

export async function kbRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  app.post('/api/admin/kb', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request', details: parsed.error.issues });
    try {
      const kb = await createKnowledgeBase(parsed.data.name, parsed.data.description ?? null);
      reply.code(201).send(kb);
    } catch (e) {
      const err = e as { message?: string; statusCode?: number };
      if (err.statusCode === 409) return reply.code(409).send({ error: 'kb_name_exists' });
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>('/api/admin/kb/:id', async (req, reply) => {
    const exists = await getKnowledgeBase(req.params.id);
    if (!exists) return reply.code(404).send({ error: 'kb_not_found' });
    await deleteKnowledgeBase(req.params.id);
    reply.code(204).send();
  });
}
