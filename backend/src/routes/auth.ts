import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isInitialized, createAdmin, verifyCredentials, getAdmin } from '../services/auth.js';

const setupSchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(128),
});

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/status', async (_req, reply) => {
    const admin = await getAdmin();
    if (!admin) return reply.send({ initialized: false });
    reply.send({ initialized: true, username: admin.username });
  });

  app.post('/api/auth/setup', async (req, reply) => {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      const weak = parsed.error.issues.some((i) => i.path.join('.') === 'password');
      return reply.code(400).send({ error: weak ? 'weak_password' : 'invalid_request', details: parsed.error.issues });
    }
    if (await isInitialized()) {
      return reply.code(409).send({ error: 'already_initialized' });
    }
    const admin = await createAdmin(parsed.data.username, parsed.data.password);
    const token = await reply.jwtSign({ sub: admin.id, username: admin.username });
    return reply.code(201).send({ token });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const admin = await verifyCredentials(parsed.data.username, parsed.data.password);
    if (!admin) return reply.code(401).send({ error: 'invalid_credentials' });
    const token = await reply.jwtSign({ sub: admin.id, username: admin.username });
    return reply.send({ token });
  });
}
