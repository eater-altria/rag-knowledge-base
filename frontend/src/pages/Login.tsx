import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth';
import { errorMessage, tokenStore } from '../api/client';

export function LoginPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const from = params.get('from') || '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { token } = await authApi.login(username, password);
      tokenStore.set(token);
      nav(from, { replace: true });
    } catch (e) {
      const msg = errorMessage(e, '登录失败');
      setErr(msg === 'invalid_credentials' ? '用户名或密码错误' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-hero-sky p-lg">
      <form onSubmit={submit} className="card w-full max-w-sm shadow-drop">
        <h1 className="mb-lg text-display-sm text-ink">管理员登录</h1>
        <label className="label">用户名</label>
        <input className="input mt-xxs mb-sm" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label className="label">密码</label>
        <input type="password" className="input mt-xxs mb-base" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="mb-sm text-caption text-error">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '登录中…' : '登录'}</button>
      </form>
    </div>
  );
}
