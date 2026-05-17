import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'FAST_JWT_EXPIRED' || /expired/i.test(err?.message ?? '')) {
      return reply.code(401).send({ error: 'token_expired' });
    }
    return reply.code(401).send({ error: 'unauthorized' });
  }
}
