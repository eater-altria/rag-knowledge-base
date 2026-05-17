import { api } from './client';

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  document_count: number;
  chunk_count: number;
};

export const kbApi = {
  list: () => api.get<KnowledgeBase[]>('/kb').then((r) => r.data),
  create: (name: string, description: string | null) =>
    api.post<KnowledgeBase>('/admin/kb', { name, description }).then((r) => r.data),
  remove: (id: string) => api.delete(`/admin/kb/${id}`),
};
