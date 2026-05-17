import { useToasts } from '../hooks/useToast';

export function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'min-w-[260px] rounded-md border px-4 py-3 text-sm font-mono shadow-lg',
            t.level === 'error' && 'border-danger/50 bg-card text-danger',
            t.level === 'success' && 'border-accent/50 bg-card text-accent',
            t.level === 'info' && 'border-border bg-card text-text',
          ].filter(Boolean).join(' ')}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
