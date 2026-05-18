import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Plus, Search, Trash2 } from 'lucide-react';
import { kbApi, type KnowledgeBase } from '../api/kb';
import { errorMessage } from '../api/client';
import { Modal } from '../components/Modal';
import { pushToast } from '../hooks/useToast';

export function KBListPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['kb'], queryFn: kbApi.list });
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<KnowledgeBase | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-lg pt-xxl pb-section">
      <header className="mb-xl flex items-end justify-between gap-base">
        <div>
          <h1 className="text-display-lg text-ink">知识库</h1>
          <p className="mt-xs text-body-md text-body">每个知识库相互隔离；上传文档后立即可被检索。</p>
        </div>
        <button className="btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> 新建知识库
        </button>
      </header>

      {isLoading && <p className="text-body-sm text-body">加载中…</p>}
      {data && data.length === 0 && (
        <div className="card text-center text-body-sm text-body">
          还没有知识库，点右上角"新建知识库"开始。
        </div>
      )}

      <div className="grid gap-base md:grid-cols-2">
        {data?.map((kb) => (
          <div key={kb.id} className="card flex flex-col gap-sm transition hover:shadow-drop">
            <div className="flex items-start justify-between gap-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-xs">
                  <Database size={16} className="text-ink" />
                  <h2 className="truncate text-title-md text-ink">{kb.name}</h2>
                </div>
                {kb.description && <p className="mt-xs text-body-sm text-body line-clamp-2">{kb.description}</p>}
              </div>
              <button
                className="rounded-md p-xs text-muted hover:bg-canvas-soft hover:text-ink"
                onClick={() => setToDelete(kb)}
                aria-label="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="flex items-center gap-xs">
              <span className="badge-pill">文档 {kb.document_count}</span>
              <span className="badge-pill">chunk {kb.chunk_count}</span>
            </div>
            <div className="flex gap-xs">
              <Link to={`/kb/${kb.id}`} className="btn-secondary flex-1">管理文档</Link>
              <Link to={`/kb/${kb.id}/retrieve`} className="btn-secondary flex-1">
                <Search size={14} /> 召回测试
              </Link>
            </div>
          </div>
        ))}
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['kb'] })} />
      <DeleteModal kb={toDelete} onClose={() => setToDelete(null)} onDone={() => qc.invalidateQueries({ queryKey: ['kb'] })} />
    </div>
  );
}

function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const m = useMutation({
    mutationFn: () => kbApi.create(name.trim(), desc.trim() || null),
    onSuccess: () => {
      pushToast('success', '知识库已创建');
      setName(''); setDesc('');
      onCreated(); onClose();
    },
    onError: (e) => pushToast('error', errorMessage(e, '创建失败')),
  });
  return (
    <Modal open={open} onClose={onClose} title="新建知识库">
      <label className="label">名称</label>
      <input className="input mt-xxs mb-sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <label className="label">描述（可选）</label>
      <textarea className="input mt-xxs mb-base min-h-[80px]" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="flex justify-end gap-xs">
        <button className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={!name.trim() || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? '创建中…' : '创建'}
        </button>
      </div>
    </Modal>
  );
}

function DeleteModal({ kb, onClose, onDone }: { kb: KnowledgeBase | null; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState('');
  const m = useMutation({
    mutationFn: () => kbApi.remove(kb!.id),
    onSuccess: () => {
      pushToast('success', '已删除');
      setConfirm('');
      onDone(); onClose();
    },
    onError: (e) => pushToast('error', errorMessage(e, '删除失败')),
  });
  if (!kb) return null;
  return (
    <Modal open={!!kb} onClose={onClose} title={`删除「${kb.name}」`}>
      <p className="mb-sm text-body-sm text-body">
        该操作会清除该知识库的全部文档与向量，且不可恢复。请输入知识库名称以确认：
      </p>
      <input className="input mb-base" placeholder={kb.name} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <div className="flex justify-end gap-xs">
        <button className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-danger" disabled={confirm !== kb.name || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? '删除中…' : '永久删除'}
        </button>
      </div>
    </Modal>
  );
}
