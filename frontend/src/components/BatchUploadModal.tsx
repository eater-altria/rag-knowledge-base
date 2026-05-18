import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FolderUp, Loader2, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { documentApi } from '../api/documents';
import { errorMessage } from '../api/client';
import { pushToast } from '../hooks/useToast';

const ALLOWED_EXT = ['.txt', '.md', '.pdf', '.docx'] as const;

type ItemStatus = 'pending' | 'uploading' | 'success' | 'failed';
type Item = {
  file: File;
  relPath: string;
  status: ItemStatus;
  error?: string;
  chunkCount?: number;
};

const HUMAN_ERRORS: Record<string, string> = {
  file_too_large: '文件过大',
  unsupported_file_type: '不支持的格式',
  too_many_chunks: '切片数超限',
  document_empty: '内容为空',
  ingestion_failed: '入库失败',
};

function hasAllowedExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((e) => lower.endsWith(e));
}

declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

type Props = {
  kbId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
};

export function BatchUploadModal({ kbId, open, onClose, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [phase, setPhase] = useState<'pick' | 'review' | 'uploading' | 'done'>('pick');

  const stats = useMemo(() => {
    const ok = items.filter((i) => i.status === 'success').length;
    const fail = items.filter((i) => i.status === 'failed').length;
    return { ok, fail, total: items.length };
  }, [items]);

  function reset() {
    setItems([]);
    setSkipped([]);
    setPhase('pick');
  }

  function handleClose() {
    if (phase === 'uploading') return;
    reset();
    onClose();
  }

  function handlePick(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const accepted: Item[] = [];
    const ignored: string[] = [];
    for (const file of Array.from(fileList)) {
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (hasAllowedExt(file.name)) {
        accepted.push({ file, relPath, status: 'pending' });
      } else {
        ignored.push(relPath);
      }
    }
    setItems(accepted);
    setSkipped(ignored);
    setPhase('review');
  }

  async function startUpload() {
    setPhase('uploading');
    for (let i = 0; i < items.length; i++) {
      setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'uploading' } : it)));
      try {
        const r = await documentApi.upload(kbId, items[i].file);
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'success', chunkCount: r.chunk_count } : it)));
      } catch (e) {
        const m = errorMessage(e, '上传失败');
        const human = HUMAN_ERRORS[m.split(':')[0]] || m;
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'failed', error: human } : it)));
      }
    }
    setPhase('done');
    onDone();
  }

  return (
    <Modal open={open} onClose={handleClose} title="批量上传文件夹">
      {phase === 'pick' && (
        <>
          <p className="mb-base text-body-sm text-body">
            选择一个文件夹，系统将自动筛选出 <code className="badge-mono">.txt .md .pdf .docx</code> 后缀的文件并依次上传。
          </p>
          <button className="btn-primary w-full" onClick={() => inputRef.current?.click()}>
            <FolderUp size={16} /> 选择文件夹
          </button>
          <input
            ref={inputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => { handlePick(e.target.files); e.target.value = ''; }}
          />
        </>
      )}

      {phase === 'review' && (
        <>
          <p className="mb-xs text-body-md text-ink">
            待上传 <span className="font-mono text-ink">{items.length}</span> 个文件
            {skipped.length > 0 && <span className="text-body">，跳过 {skipped.length} 个（格式不符）</span>}
          </p>
          <FileList items={items} />
          {skipped.length > 0 && (
            <details className="mt-sm text-caption text-body">
              <summary className="cursor-pointer">查看跳过的 {skipped.length} 个文件</summary>
              <ul className="mt-xs max-h-32 overflow-auto font-mono">
                {skipped.map((p) => <li key={p} className="truncate">{p}</li>)}
              </ul>
            </details>
          )}
          <div className="mt-base flex justify-end gap-xs">
            <button className="btn-secondary" onClick={reset}>重新选择</button>
            <button className="btn-primary" disabled={items.length === 0} onClick={startUpload}>开始上传</button>
          </div>
        </>
      )}

      {phase === 'uploading' && (
        <>
          <p className="mb-sm text-body-md text-ink">
            上传中… <span className="font-mono text-body">{items.filter(i => i.status !== 'pending' && i.status !== 'uploading').length}/{items.length}</span>
          </p>
          <FileList items={items} />
        </>
      )}

      {phase === 'done' && (
        <>
          <p className="mb-sm text-body-md text-ink">
            完成：<span className="font-mono text-success">{stats.ok}</span> 成功
            {stats.fail > 0 && <span className="font-mono text-error">，{stats.fail} 失败</span>}
          </p>
          <FileList items={items} />
          <div className="mt-base flex justify-end gap-xs">
            <button className="btn-secondary" onClick={reset}>再传一批</button>
            <button className="btn-primary" onClick={() => { reset(); onClose(); pushToast('success', `已上传 ${stats.ok} 个文件`); }}>关闭</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function FileList({ items }: { items: Item[] }) {
  return (
    <ul className="max-h-72 overflow-auto rounded-md border border-hairline-strong bg-canvas-soft">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-xs border-b border-hairline px-sm py-xs text-caption last:border-b-0">
          <StatusIcon status={it.status} />
          <span className="flex-1 truncate font-mono text-ink" title={it.relPath}>{it.relPath}</span>
          {it.status === 'success' && <span className="text-body">{it.chunkCount} chunk</span>}
          {it.status === 'failed' && <span className="text-error">{it.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === 'pending') return <span className="inline-block h-3 w-3 rounded-full bg-hairline-strong" />;
  if (status === 'uploading') return <Loader2 size={14} className="animate-spin text-ink" />;
  if (status === 'success') return <CheckCircle2 size={14} className="text-success" />;
  return <XCircle size={14} className="text-error" />;
}
