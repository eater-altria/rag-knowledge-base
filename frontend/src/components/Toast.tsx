import { useToasts } from '../hooks/useToast';

export function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-base right-base z-50 flex flex-col gap-xs">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            'min-w-[260px] rounded-md border bg-surface-card px-base py-sm text-body-sm shadow-drop',
            t.level === 'error' && 'border-error/60 text-ink',
            t.level === 'success' && 'border-success/40 text-ink',
            t.level === 'info' && 'border-hairline-strong text-ink',
          ].filter(Boolean).join(' ')}
        >
          <div className="flex items-center gap-xs">
            <span
              className={[
                'inline-block h-2 w-2 rounded-full',
                t.level === 'error' && 'bg-error',
                t.level === 'success' && 'bg-success',
                t.level === 'info' && 'bg-muted',
              ].filter(Boolean).join(' ')}
            />
            <span>{t.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
