import { AutoTokenizer, AutoModelForSequenceClassification, env } from '@xenova/transformers';
import { config } from '../config.js';
import { logger } from '../logger.js';

env.cacheDir = config.MODEL_CACHE_DIR;

let tokenizer: any = null;
let model: any = null;

export async function loadReranker(): Promise<void> {
  if (tokenizer && model) return;
  const start = Date.now();
  logger.info({ model: config.RERANKER_MODEL }, 'loading reranker model');
  tokenizer = await AutoTokenizer.from_pretrained(config.RERANKER_MODEL);
  model = await AutoModelForSequenceClassification.from_pretrained(config.RERANKER_MODEL);
  logger.info({ ms: Date.now() - start }, 'reranker model ready');
}

export function isRerankerReady(): boolean {
  return tokenizer != null && model != null;
}

/**
 * Score (query, passage) pairs with a cross-encoder. Returns scores aligned
 * with the input order (higher = more relevant).
 */
export async function rerank(query: string, passages: string[]): Promise<number[]> {
  if (!tokenizer || !model) throw new Error('reranker model not loaded');
  if (passages.length === 0) return [];
  const scores: number[] = [];
  const BATCH = 16;
  for (let i = 0; i < passages.length; i += BATCH) {
    const batch = passages.slice(i, i + BATCH);
    const inputs = tokenizer(
      batch.map(() => query),
      { text_pair: batch, padding: true, truncation: true, max_length: 512, return_tensors: 'pt' },
    );
    const out = await model(inputs);
    // logits shape: [batch, 1]
    const data = out.logits.data as Float32Array;
    for (let b = 0; b < batch.length; b++) {
      scores.push(data[b]);
    }
  }
  return scores;
}
