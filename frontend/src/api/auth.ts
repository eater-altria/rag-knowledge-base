import { api } from './client';

export type AuthStatus = { initialized: boolean; username?: string };

export const authApi = {
  status: () => api.get<AuthStatus>('/auth/status').then((r) => r.data),
  setup: (username: string, password: string) =>
    api.post<{ token: string }>('/auth/setup', { username, password }).then((r) => r.data),
  login: (username: string, password: string) =>
    api.post<{ token: string }>('/auth/login', { username, password }).then((r) => r.data),
};
