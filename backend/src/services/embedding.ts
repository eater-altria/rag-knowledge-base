import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { config } from '../config.js';
import { logger } from '../logger.js';

env.cacheDir = config.MODEL_CACHE_DIR;
env.allowRemoteModels = true;
env.allowLocalModels = true;

let extractor: FeatureExtractionPipeline | null = null;
let dim: number | null = null;

export async function loadEmbedding(): Promise<void> {
  if (extractor) return;
  const start = Date.now();
  logger.info({ model: config.EMBEDDING_MODEL }, 'loading embedding model');
  extractor = (await pipeline('feature-extraction', config.EMBEDDING_MODEL)) as FeatureExtractionPipeline;
  // warm up + capture dimension
  const probe = await extractor('warmup', { pooling: 'mean', normalize: true });
  dim = probe.data.length;
  logger.info({ model: config.EMBEDDING_MODEL, dim, ms: Date.now() - start }, 'embedding model ready');
}

export function embeddingDim(): number {
  if (dim == null) throw new Error('embedding model not loaded');
  return dim;
}

export function isEmbeddingReady(): boolean {
  return extractor != null && dim != null;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!extractor) throw new Error('embedding model not loaded');
  if (texts.length === 0) return [];
  const out: number[][] = [];
  const BATCH = 16;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
    // tensor.dims = [batch, dim]; data is flat Float32Array
    const d = tensor.dims[1] as number;
    const data = tensor.data as Float32Array;
    for (let b = 0; b < batch.length; b++) {
      out.push(Array.from(data.slice(b * d, (b + 1) * d)));
    }
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
