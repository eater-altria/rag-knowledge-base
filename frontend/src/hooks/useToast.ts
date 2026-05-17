import { useEffect, useState } from 'react';

export type Toast = { id: number; level: 'info' | 'error' | 'success'; message: string };
type Listener = (toasts: Toast[]) => void;

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function pushToast(level: Toast['level'], message: string, ttl = 3500) {
  const t: Toast = { id: nextId++, level, message };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, ttl);
}

export function useToasts(): Toast[] {
  const [state, setState] = useState<Toast[]>(toasts);
  useEffect(() => {
    const l: Listener = (t) => setState(t);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}
