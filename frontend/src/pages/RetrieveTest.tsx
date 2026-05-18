import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { retrieveApi, type RetrievedChunk } from '../api/retrieve';
import { errorMessage } from '../api/client';
import { pushToast } from '../hooks/useToast';

const SOURCE_CLASSES: Record<RetrievedChunk['source'], string> = {
  vector: 'bg-surface-strong text-body',
  keyword: 'bg-surface-strong text-body',
  both: 'bg-ink text-on-dark',
};

export function RetrieveTestPage() {
  const { id } = useParams();
  const kbId = id!;
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const m = useMutation({
    mutationFn: () => retrieveApi.query(kbId, query, topK),
    onError: (e) => pushToast('error', errorMessage(e, '召回失败')),
  });

  return (
    <div className="mx-auto max-w-5xl px-lg pt-xl pb-section">
      <header className="mb-lg flex items-center justify-between">
        <Link to={`/kb/${kbId}`} className="btn-secondary"><ArrowLeft size={14} /> 返回文档</Link>
      </header>

      <div className="card mb-lg">
        <h1 className="mb-xxs text-display-sm text-ink">召回测试</h1>
        <p className="mb-base text-caption text-body">
          直接调用公开召回 API（无鉴权）。返回的是 chunk 原文，不做 LLM 汇总。
        </p>
        <textarea
          className="input mb-sm min-h-[100px] font-mono"
          placeholder="输入查询…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-sm">
          <label className="text-caption text-body">top_k</label>
          <input
            type="number"
            min={1}
            max={50}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="input !w-24 font-mono"
          />
          <button
            className="btn-primary ml-auto"
            disabled={!query.trim() || m.isPending}
            onClick={() => m.mutate()}
          >
            <Sparkles size={14} /> {m.isPending ? '检索中…' : '召回'}
          </button>
        </div>
      </div>

      {m.data && m.data.length === 0 && (
        <p className="text-body-sm text-body">没有命中的 chunk。</p>
      )}
      <div className="flex flex-col gap-sm">
        {m.data?.map((r, i) => (
          <div key={r.chunk_id} className="card">
            <div className="mb-sm flex items-center justify-between text-caption">
              <div className="flex items-center gap-xs text-body">
                <span className="font-mono text-ink">#{i + 1}</span>
                <span>{r.document_filename}</span>
              </div>
              <div className="flex items-center gap-xs">
                <span className="badge-mono">score {r.score.toFixed(4)}</span>
                <span className={`badge-pill ${SOURCE_CLASSES[r.source]}`}>{r.source}</span>
              </div>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-surface-dark p-base font-mono text-code text-on-dark">
              {r.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
