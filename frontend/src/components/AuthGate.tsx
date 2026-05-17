import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/auth';
import { tokenStore } from '../api/client';

type Props = { children: React.ReactNode };

type State =
  | { kind: 'loading' }
  | { kind: 'needs-setup' }
  | { kind: 'needs-login' }
  | { kind: 'ready' };

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    authApi.status().then((s) => {
      if (!alive) return;
      if (!s.initialized) setState({ kind: 'needs-setup' });
      else if (!tokenStore.get()) setState({ kind: 'needs-login' });
      else setState({ kind: 'ready' });
    }).catch(() => alive && setState({ kind: 'needs-login' }));
    return () => { alive = false; };
  }, []);

  if (state.kind === 'loading') {
    return <div className="flex h-full items-center justify-center text-muted text-sm">loading…</div>;
  }
  if (state.kind === 'needs-setup') return <Navigate to="/setup" replace />;
  if (state.kind === 'needs-login') return <Navigate to={`/login?from=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}
