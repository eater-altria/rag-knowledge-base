import { z } from 'zod';

const schema = z.object({
  HTTP_PORT: z.coerce.number().int().positive().default(3000),
  HTTP_HOST: z.string().default('0.0.0.0'),

  POSTGRES_HOST: z.string().default('postgres'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().default('rag'),
  POSTGRES_USER: z.string().default('rag'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),

  QDRANT_URL: z.string().url().default('http://qdrant:6333'),
  QDRANT_API_KEY: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  EMBEDDING_MODEL: z.string().default('Xenova/bge-base-zh-v1.5'),
  RERANKER_MODEL: z.string().default('Xenova/bge-reranker-base'),
  MODEL_CACHE_DIR: z.string().default('/app/models'),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),
  MAX_CHUNKS_PER_DOC: z.coerce.number().int().positive().default(5000),
  CHUNK_SIZE: z.coerce.number().int().positive().default(500),
  CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(80),

  RETRIEVE_RATE_PER_MIN: z.coerce.number().int().positive().default(60),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = z.infer<typeof schema>;

function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[config] invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();

export function redactedConfig(): Record<string, unknown> {
  const c: Record<string, unknown> = { ...config };
  c.POSTGRES_PASSWORD = '***';
  c.JWT_SECRET = '***';
  if (c.QDRANT_API_KEY) c.QDRANT_API_KEY = '***';
  return c;
}
