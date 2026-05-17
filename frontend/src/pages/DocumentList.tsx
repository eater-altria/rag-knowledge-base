import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, FolderUp, Search, Trash2, Upload } from 'lucide-react';
import { documentApi, type DocumentRow } from '../api/documents';
import { errorMessage } from '../api/client';
import { pushToast } from '../hooks/useToast';
import { BatchUploadModal } from '../components/BatchUploadModal';

const HUMAN_ERRORS: Record<string, string> = {
  file_too_large: '文件过大（超过 MAX_UPLOAD_MB）',
  unsupported_file_type: '不支持的文件格式（仅 txt/md/pdf/docx）',
  too_many_chunks: '切片数超过上限',
  document_empty: '文档内容为空',
  ingestion_failed: '入库失败',
};

export function DocumentListPage() {
  const { id } = useParams();
  const kbId = id!;
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['documents', kbId],
    queryFn: () => documentApi.list(kbId, 100, 0),
  });

  const upload = useMutation({
    mutationFn: (file: File) => documentApi.upload(kbId, file),
    onSuccess: (r) => {
      pushToast('success', `已入库，${r.chunk_count} 个 chunk`);
      qc.invalidateQueries({ queryKey: ['documents', kbId] });
    },
    onError: (e) => {
      const m = errorMessage(e, '上传失败');
      pushToast('error', HUMAN_ERRORS[m] || m);
    },
  });

  const remove = useMutation({
    mutationFn: (doc: DocumentRow) => documentApi.remove(kbId, doc.id),
    onSuccess: () => {
      pushToast('success', '已删除');
      qc.invalidateQueries({ queryKey: ['documents', kbId] });
    },
    onError: (e) => pushToast('error', errorMessage(e, '删除失败')),
  });

  function handleFile(file: File | null) {
    if (!file) return;
    upload.mutate(file);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="btn-ghost border border-border"><ArrowLeft size={14} /> 返回</Link>
        <Link to={`/kb/${kbId}/retrieve`} className="btn-ghost border border-border">
          <Search size={14} /> 召回测试
        </Link>
      </header>

      <div
        className={[
          'card mb-6 flex flex-col items-center justify-center border-dashed text-center transition',
          dragging ? 'border-accent bg-cardHover' : 'border-border',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <Upload className="mb-2 text-accent" size={28} />
        <p className="text-sm">拖拽文件到此处，或</p>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? '上传中…' : '选择文件'}
          </button>
          <button className="btn-ghost border border-border" onClick={() => setBatchOpen(true)} disabled={upload.isPending}>
            <FolderUp size={14} /> 批量上传文件夹
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          className="hidden"
          onChange={(e) => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
        />
        <p className="mt-3 text-xs text-muted">支持 .txt / .md / .pdf / .docx；上传完成后立即向量化。</p>
      </div>

      <BatchUploadModal
        kbId={kbId}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onDone={() => qc.invalidateQueries({ queryKey: ['documents', kbId] })}
      />

      <div className="rounded-card border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="px-4 py-3 text-left">文件名</th>
              <th className="px-4 py-3 text-left">大小</th>
              <th className="px-4 py-3 text-left">chunk</th>
              <th className="px-4 py-3 text-left">上传时间</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.items.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">暂无文档</td></tr>
            )}
            {data?.items.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><FileText size={14} className="text-muted" /> {d.filename}</div></td>
                <td className="px-4 py-3 text-muted">{formatSize(d.size_bytes)}</td>
                <td className="px-4 py-3 font-mono text-xs">{d.chunk_count}</td>
                <td className="px-4 py-3 text-muted">{new Date(d.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-ghost !px-2 !py-1 text-muted hover:text-danger" disabled={remove.isPending} onClick={() => remove.mutate(d)} aria-label="删除">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
