import { api } from './client';

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  kb_id: string;
  content: string;
  document_filename: string;
  score: number;
  source: 'vector' | 'keyword' | 'both';
};

export const retrieveApi = {
  query: (kbId: string, query: string, topK = 10) =>
    api
      .post<{ results: RetrievedChunk[] }>('/retrieve', { kb_id: kbId, query, top_k: topK })
      .then((r) => r.data.results),
};
