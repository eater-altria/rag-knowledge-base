import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { retrieveApi, type RetrievedChunk } from '../api/retrieve';
import { errorMessage } from '../api/client';
import { pushToast } from '../hooks/useToast';

const SOURCE_COLOR: Record<RetrievedChunk['source'], string> = {
  vector: 'bg-bg text-muted',
  keyword: 'bg-bg text-muted',
  both: 'bg-accent/15 text-accent',
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
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <Link to={`/kb/${kbId}`} className="btn-ghost border border-border"><ArrowLeft size={14} /> 返回文档</Link>
      </header>

      <div className="card mb-6">
        <h1 className="mb-1 text-lg font-semibold">召回测试</h1>
        <p className="mb-4 text-xs text-muted">直接调用公开召回 API（无鉴权）。返回的是 chunk 原文，不做 LLM 汇总。</p>
        <textarea
          className="input mb-3 min-h-[100px] font-mono"
          placeholder="输入查询…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted">top_k</label>
          <input type="number" min={1} max={50} value={topK} onChange={(e) => setTopK(Number(e.target.value))}
                 className="input !w-20" />
          <button className="btn-primary ml-auto" disabled={!query.trim() || m.isPending} onClick={() => m.mutate()}>
            <Sparkles size={14} /> {m.isPending ? '检索中…' : '召回'}
          </button>
        </div>
      </div>

      {m.data && m.data.length === 0 && <p className="text-sm text-muted">没有命中的 chunk。</p>}
      <div className="flex flex-col gap-3">
        {m.data?.map((r, i) => (
          <div key={r.chunk_id} className="card">
            <div className="mb-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted">
                <span className="font-mono">#{i + 1}</span>
                <span>{r.document_filename}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge font-mono text-muted">score {r.score.toFixed(4)}</span>
                <span className={`badge ${SOURCE_COLOR[r.source]}`}>{r.source}</span>
              </div>
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm text-text">{r.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
