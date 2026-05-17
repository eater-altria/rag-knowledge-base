import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config, redactedConfig } from './config.js';
import { logger } from './logger.js';
import { loadEmbedding } from './services/embedding.js';
import { loadReranker } from './services/reranker.js';
import { authRoutes } from './routes/auth.js';
import { kbRoutes, publicKbRoutes } from './routes/kb.js';
import { documentRoutes } from './routes/documents.js';
import { retrieveRoutes } from './routes/retrieve.js';
import { healthRoutes } from './routes/health.js';
import { mcpRoutes } from './routes/mcp.js';

async function main() {
  logger.info({ config: redactedConfig() }, 'starting rag-backend');

  const app = Fastify({
    logger,
    bodyLimit: 1024 * 1024, // small JSON bodies; multipart handles files separately
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
      files: 1,
    },
  });

  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: '1 minute',
  });

  // public routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(retrieveRoutes);
  await app.register(publicKbRoutes);
  await app.register(mcpRoutes);

  // admin routes (each plugin adds its own JWT preHandler)
  await app.register(kbRoutes);
  await app.register(documentRoutes);

  // file-too-large from multipart bubbles up as FST_REQ_FILE_TOO_LARGE
  app.setErrorHandler((err, _req, reply) => {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: 'file_too_large' });
    }
    reply.send(err);
  });

  // Preload models so first request is fast; failure here exits.
  try {
    await Promise.all([loadEmbedding(), loadReranker()]);
  } catch (e) {
    logger.error({ err: e }, 'failed to load models');
    process.exit(1);
  }

  await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
  logger.info({ host: config.HTTP_HOST, port: config.HTTP_PORT }, 'rag-backend listening');
}

main().catch((e) => {
  logger.fatal({ err: e }, 'fatal startup error');
  process.exit(1);
});
