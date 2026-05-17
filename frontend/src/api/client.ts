import axios, { AxiosError } from 'axios';

const TOKEN_KEY = 'rag.token';

export const tokenStore = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: '/api',
  timeout: 5 * 60_000, // long enough for slow uploads
});

api.interceptors.request.use((cfg) => {
  const t = tokenStore.get();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(h: () => void) {
  onUnauthorized = h;
}

api.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    // /api/auth/login getting 401 is expected — don't trigger global logout.
    const url = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/setup')) {
      tokenStore.clear();
      onUnauthorized?.();
    }
    return Promise.reject(err);
  },
);

export function errorMessage(err: unknown, fallback = '请求失败'): string {
  const ax = err as AxiosError<{ error?: string; reason?: string }>;
  const data = ax?.response?.data;
  if (data?.error) return data.reason ? `${data.error}: ${data.reason}` : data.error;
  return fallback;
}
