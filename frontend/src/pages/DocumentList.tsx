import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, FileText, FolderUp, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { documentApi, type DocumentPreview, type DocumentRow } from '../api/documents';
import { errorMessage } from '../api/client';
import { pushToast } from '../hooks/useToast';
import { BatchUploadModal } from '../components/BatchUploadModal';
import { Modal } from '../components/Modal';

const HUMAN_ERRORS: Record<string, string> = {
  file_too_large: '文件过大（超过 MAX_UPLOAD_MB）',
  unsupported_file_type: '不支持的文件格式（仅 txt/md/pdf/docx）',
  too_many_chunks: '切片数超过上限',
  document_empty: '文档内容为空',
  ingestion_failed: '入库失败',
  invalid_request: '请求参数不合法',
  document_not_found: '文档不存在或已被删除',
};

const PREVIEW_PAGE_SIZE = 50;

export function DocumentListPage() {
  const { id } = useParams();
  const kbId = id!;
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentRow | null>(null);

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
    <div className="mx-auto max-w-5xl px-lg pt-xl pb-section">
      <header className="mb-lg flex items-center justify-between">
        <Link to="/" className="btn-secondary"><ArrowLeft size={14} /> 返回</Link>
        <Link to={`/kb/${kbId}/retrieve`} className="btn-secondary">
          <Search size={14} /> 召回测试
        </Link>
      </header>

      <div
        className={[
          'mb-lg flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-canvas-soft px-lg py-xl text-center transition',
          dragging ? 'border-ink bg-surface-strong' : 'border-hairline-strong',
        ].join(' ')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <Upload className="mb-xs text-ink" size={28} />
        <p className="text-body-md text-ink">拖拽文件到此处，或</p>
        <div className="mt-sm flex gap-xs">
          <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? '上传中…' : '选择文件'}
          </button>
          <button className="btn-secondary" onClick={() => setBatchOpen(true)} disabled={upload.isPending}>
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
        <p className="mt-sm text-caption text-body">支持 .txt / .md / .pdf / .docx；上传完成后立即向量化。</p>
      </div>

      <BatchUploadModal
        kbId={kbId}
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        onDone={() => qc.invalidateQueries({ queryKey: ['documents', kbId] })}
      />

      <div className="overflow-hidden rounded-lg border border-hairline-strong bg-surface-card">
        <table className="w-full text-body-sm">
          <thead className="bg-canvas-soft text-caption-uppercase uppercase text-body">
            <tr>
              <th className="px-base py-sm text-left font-semibold">文件名</th>
              <th className="px-base py-sm text-left font-semibold">大小</th>
              <th className="px-base py-sm text-left font-semibold">chunk</th>
              <th className="px-base py-sm text-left font-semibold">上传时间</th>
              <th className="px-base py-sm"></th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.items.length === 0) && (
              <tr><td colSpan={5} className="px-base py-xxl text-center text-body">暂无文档</td></tr>
            )}
            {data?.items.map((d) => (
              <tr key={d.id} className="border-t border-hairline">
                <td className="px-base py-sm">
                  <div className="flex items-center gap-xs text-ink">
                    <FileText size={14} className="text-muted" /> {d.filename}
                  </div>
                </td>
                <td className="px-base py-sm text-body">{formatSize(d.size_bytes)}</td>
                <td className="px-base py-sm font-mono text-caption text-ink">{d.chunk_count}</td>
                <td className="px-base py-sm text-body">{new Date(d.created_at).toLocaleString()}</td>
                <td className="px-base py-sm text-right">
                  <div className="flex justify-end gap-xxs">
                    <button
                      className="rounded-md p-xs text-muted hover:bg-canvas-soft hover:text-ink"
                      onClick={() => setPreviewDoc(d)}
                      aria-label="预览"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      className="rounded-md p-xs text-muted hover:bg-canvas-soft hover:text-ink"
                      onClick={() => setRenameDoc(d)}
                      aria-label="重命名"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="rounded-md p-xs text-muted hover:bg-canvas-soft hover:text-ink disabled:opacity-50"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(d)}
                      aria-label="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocumentPreviewModal kbId={kbId} doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <RenameDocumentModal kbId={kbId} doc={renameDoc} onClose={() => setRenameDoc(null)} />
    </div>
  );
}

function DocumentPreviewModal({ kbId, doc, onClose }: { kbId: string; doc: DocumentRow | null; onClose: () => void }) {
  const [state, setState] = useState<DocumentPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!doc) {
      setState(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    documentApi.preview(kbId, doc.id, PREVIEW_PAGE_SIZE, 0)
      .then((r) => { if (!cancelled) setState(r); })
      .catch((e) => { if (!cancelled) pushToast('error', HUMAN_ERRORS[errorMessage(e, '加载失败')] ?? errorMessage(e, '加载失败')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kbId, doc]);

  async function loadMore() {
    if (!doc || !state || !state.truncated) return;
    setLoading(true);
    try {
      const more = await documentApi.preview(kbId, doc.id, PREVIEW_PAGE_SIZE, state.next_offset);
      setState({
        text: state.text + '\n\n' + more.text,
        total_chunks: more.total_chunks,
        returned_chunks: state.returned_chunks + more.returned_chunks,
        truncated: more.truncated,
        next_offset: more.next_offset,
      });
    } catch (e) {
      pushToast('error', HUMAN_ERRORS[errorMessage(e, '加载失败')] ?? errorMessage(e, '加载失败'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={!!doc} onClose={onClose} title={doc ? `预览：${doc.filename}` : ''}>
      <p className="mb-sm text-caption text-body">以下是切分后用于召回的纯文本，不含原文档的图片、表格、排版。</p>
      <pre className="mb-sm max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-dark p-base font-mono text-code text-on-dark">
        {state?.text ?? (loading ? '加载中…' : '')}
      </pre>
      <div className="flex items-center justify-between text-caption text-body">
        <span>
          {state ? `已加载 ${state.returned_chunks} / 共 ${state.total_chunks} 切片` : ''}
        </span>
        <div className="flex gap-xs">
          {state?.truncated && (
            <button className="btn-secondary" onClick={loadMore} disabled={loading}>
              {loading ? '加载中…' : '加载更多'}
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </Modal>
  );
}

function RenameDocumentModal({ kbId, doc, onClose }: { kbId: string; doc: DocumentRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(doc?.filename ?? '');
  }, [doc]);

  const rename = useMutation({
    mutationFn: (filename: string) => documentApi.rename(kbId, doc!.id, filename),
    onSuccess: () => {
      pushToast('success', '已重命名');
      qc.invalidateQueries({ queryKey: ['documents', kbId] });
      onClose();
    },
    onError: (e) => {
      const m = errorMessage(e, '重命名失败');
      pushToast('error', HUMAN_ERRORS[m] || m);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!doc || !trimmed || trimmed === doc.filename) return;
    rename.mutate(trimmed);
  }

  return (
    <Modal open={!!doc} onClose={onClose} title="重命名文档">
      <form onSubmit={submit} className="space-y-sm">
        <input
          autoFocus
          className="input w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={255}
        />
        <div className="flex justify-end gap-xs">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={rename.isPending}>取消</button>
          <button type="submit" className="btn-primary" disabled={rename.isPending || !value.trim() || value.trim() === doc?.filename}>
            {rename.isPending ? '提交中…' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
