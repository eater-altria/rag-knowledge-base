import { api } from './client';

export type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
};

export const documentApi = {
  list: (kbId: string, limit = 50, offset = 0) =>
    api
      .get<{ items: DocumentRow[]; total: number }>(`/admin/kb/${kbId}/documents`, { params: { limit, offset } })
      .then((r) => r.data),
  upload: (kbId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<{ document_id: string; chunk_count: number }>(
      `/admin/kb/${kbId}/documents`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ).then((r) => r.data);
  },
  uploadBatch: (kbId: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('file', f);
    return api.post<{
      uploaded: { filename: string; document_id: string; chunk_count: number }[];
      failed: { filename: string; error: string; reason?: string }[];
    }>(`/admin/kb/${kbId}/documents/batch`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  remove: (kbId: string, docId: string) => api.delete(`/admin/kb/${kbId}/documents/${docId}`),
};
