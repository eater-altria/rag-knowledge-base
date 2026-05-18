/**
 * Offline retrieval evaluation harness.
 *
 *   tsx src/cli/eval.ts --dataset=eval/example.dataset.json [--kb=<id|name>] [--top-k=5] [--out=results.json] [--match=content|context]
 *
 * Dataset format (JSON):
 *   {
 *     "name":   "optional run label",
 *     "kb":     "default kb id or name",       // can be overridden per case
 *     "top_k":  5,                              // default for all cases
 *     "match":  "context",                     // "context" (default) or "content"
 *     "cases":  [
 *       {
 *         "query": "什么是 RAG？",
 *         "kb": "optional override",
 *         "top_k": 10,
 *         "expected_filenames":  ["intro.md"],   // any of these in top-K = hit
 *         "expected_substrings": ["检索增强"]    // each must appear in some chunk's text
 *       }
 *     ]
 *   }
 *
 * Metrics reported (averaged over the cases that defined each expectation):
 *   hit@K       fraction of cases where ≥1 expected item is in top-K
 *   recall@K    fraction of expected items present in top-K
 *   MRR         mean reciprocal rank of the first expected item
 *
 * Requires the same env as the server (POSTGRES_*, QDRANT_URL, JWT_SECRET, ...)
 * because it loads the real services. The referenced KB(s) must already exist
 * with ingested documents.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { retrieve, type RetrievedChunk } from '../services/retrieval.js';
import { getKnowledgeBase, listKnowledgeBases } from '../services/kb.js';
import { loadEmbedding } from '../services/embedding.js';
import { loadReranker } from '../services/reranker.js';
import { pool } from '../db/pg.js';

type EvalCase = {
  query: string;
  kb?: string;
  top_k?: number;
  expected_filenames?: string[];
  expected_substrings?: string[];
};

type EvalDataset = {
  name?: string;
  kb?: string;
  top_k?: number;
  match?: 'content' | 'context';
  cases: EvalCase[];
};

type Args = {
  dataset?: string;
  kb?: string;
  'top-k'?: string;
  out?: string;
  match?: 'content' | 'context';
};

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      out[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out as Args;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveKb(idOrName: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(idOrName);
  if (hit) return hit;
  if (UUID_RE.test(idOrName)) {
    const kb = await getKnowledgeBase(idOrName);
    if (kb) {
      cache.set(idOrName, kb.id);
      return kb.id;
    }
  }
  const all = await listKnowledgeBases();
  const found = all.find((k) => k.name === idOrName);
  if (!found) throw new Error(`kb_not_found: ${idOrName}`);
  cache.set(idOrName, found.id);
  return found.id;
}

type CaseMetrics = {
  doc?: { hit: number; recall: number; mrr: number };
  substr?: { hit: number; recall: number; mrr: number };
};

function evalCase(
  c: EvalCase,
  results: RetrievedChunk[],
  matchField: 'content' | 'context',
): CaseMetrics {
  const out: CaseMetrics = {};
  if (c.expected_filenames?.length) {
    const expected = new Set(c.expected_filenames);
    const filenamesInOrder = results.map((r) => r.document_filename);
    const distinctFound = new Set(filenamesInOrder.filter((f) => expected.has(f)));
    const firstRank = filenamesInOrder.findIndex((f) => expected.has(f));
    out.doc = {
      hit: distinctFound.size > 0 ? 1 : 0,
      recall: distinctFound.size / expected.size,
      mrr: firstRank >= 0 ? 1 / (firstRank + 1) : 0,
    };
  }
  if (c.expected_substrings?.length) {
    const texts = results.map((r) => (matchField === 'content' ? r.content : r.context));
    const ranks = c.expected_substrings.map((s) => {
      const idx = texts.findIndex((t) => t.includes(s));
      return idx >= 0 ? idx + 1 : 0;
    });
    const found = ranks.filter((r) => r > 0).length;
    out.substr = {
      hit: found > 0 ? 1 : 0,
      recall: found / c.expected_substrings.length,
      mrr:
        ranks.reduce((acc, r) => acc + (r > 0 ? 1 / r : 0), 0) / c.expected_substrings.length,
    };
  }
  return out;
}

type PerCaseRow = {
  index: number;
  query: string;
  kb: string;
  top_k: number;
  results: { filename: string; score: number; chunk_id: string }[];
  metrics: CaseMetrics;
};

function fmt(n: number): string {
  return n.toFixed(3);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dataset) {
    console.error(
      'usage: tsx src/cli/eval.ts --dataset=<path> [--kb=<id|name>] [--top-k=N] [--out=<path>] [--match=content|context]',
    );
    process.exit(2);
  }
  const ds: EvalDataset = JSON.parse(readFileSync(path.resolve(args.dataset), 'utf-8'));
  const defaultKb = args.kb ?? ds.kb;
  const defaultTopK = Number(args['top-k'] ?? ds.top_k ?? 5);
  const matchField: 'content' | 'context' = args.match ?? ds.match ?? 'context';

  console.error(`[eval] dataset=${args.dataset} cases=${ds.cases.length} default_top_k=${defaultTopK} match=${matchField}`);
  console.error('[eval] loading embedding + reranker (first run downloads models)...');
  await Promise.all([loadEmbedding(), loadReranker()]);

  const kbCache = new Map<string, string>();
  const rows: PerCaseRow[] = [];

  for (let i = 0; i < ds.cases.length; i++) {
    const c = ds.cases[i];
    const kbRef = c.kb ?? defaultKb;
    if (!kbRef) {
      console.error(`[case ${i + 1}] skipped: no kb specified`);
      continue;
    }
    if (!c.expected_filenames?.length && !c.expected_substrings?.length) {
      console.error(`[case ${i + 1}] skipped: no expected_filenames or expected_substrings`);
      continue;
    }
    const kbId = await resolveKb(kbRef, kbCache);
    const topK = c.top_k ?? defaultTopK;
    const candidates = Math.max(20, topK * 4);

    const t0 = Date.now();
    const results = await retrieve({
      kbId,
      query: c.query,
      topK,
      vectorK: candidates,
      keywordK: candidates,
    });
    const dt = Date.now() - t0;

    const metrics = evalCase(c, results, matchField);
    rows.push({
      index: i,
      query: c.query,
      kb: kbRef,
      top_k: topK,
      results: results.map((r) => ({
        filename: r.document_filename,
        score: r.score,
        chunk_id: r.chunk_id,
      })),
      metrics,
    });

    const tags: string[] = [];
    if (metrics.doc) {
      tags.push(
        `doc[hit=${metrics.doc.hit} r=${fmt(metrics.doc.recall)} mrr=${fmt(metrics.doc.mrr)}]`,
      );
    }
    if (metrics.substr) {
      tags.push(
        `sub[hit=${metrics.substr.hit} r=${fmt(metrics.substr.recall)} mrr=${fmt(metrics.substr.mrr)}]`,
      );
    }
    console.error(
      `[case ${i + 1}/${ds.cases.length}] ${dt}ms  ${tags.join(' ')}  ${c.query.slice(0, 60)}`,
    );
  }

  // Aggregate. Each metric is averaged over the cases that defined that expectation.
  const summarize = (key: 'doc' | 'substr') => {
    const present = rows.filter((r) => r.metrics[key]).map((r) => r.metrics[key]!);
    if (present.length === 0) return null;
    return {
      cases: present.length,
      hit: present.reduce((a, m) => a + m.hit, 0) / present.length,
      recall: present.reduce((a, m) => a + m.recall, 0) / present.length,
      mrr: present.reduce((a, m) => a + m.mrr, 0) / present.length,
    };
  };
  const docSummary = summarize('doc');
  const subSummary = summarize('substr');

  console.log('');
  console.log('===== retrieval eval =====');
  if (ds.name) console.log(`dataset: ${ds.name}`);
  console.log(`cases evaluated: ${rows.length}`);
  console.log(`match field:     ${matchField}`);
  console.log('');
  console.log(pad('metric', 20) + pad('cases', 8) + pad('hit@K', 10) + pad('recall@K', 12) + 'MRR');
  console.log('-'.repeat(58));
  if (docSummary) {
    console.log(
      pad('filename match', 20) +
        pad(String(docSummary.cases), 8) +
        pad(fmt(docSummary.hit), 10) +
        pad(fmt(docSummary.recall), 12) +
        fmt(docSummary.mrr),
    );
  }
  if (subSummary) {
    console.log(
      pad('substring match', 20) +
        pad(String(subSummary.cases), 8) +
        pad(fmt(subSummary.hit), 10) +
        pad(fmt(subSummary.recall), 12) +
        fmt(subSummary.mrr),
    );
  }
  if (!docSummary && !subSummary) {
    console.log('(no cases had expectations to evaluate)');
  }

  if (args.out) {
    const payload = {
      dataset: ds.name ?? path.basename(args.dataset),
      match_field: matchField,
      summary: { doc: docSummary, substr: subSummary },
      cases: rows,
    };
    writeFileSync(path.resolve(args.out), JSON.stringify(payload, null, 2));
    console.log(`\nwrote ${args.out}`);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
