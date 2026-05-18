import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { tokenStore, errorMessage } from '../api/client';
import { pushToast } from '../hooks/useToast';

export function SetupPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    authApi.status().then((s) => { if (s.initialized) nav('/login', { replace: true }); });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) return setErr('密码至少 8 位');
    if (password !== confirm) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      const { token } = await authApi.setup(username, password);
      tokenStore.set(token);
      pushToast('success', '管理员账户已创建');
      nav('/', { replace: true });
    } catch (e) {
      setErr(errorMessage(e, '创建失败'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-hero-sky p-lg">
      <form onSubmit={submit} className="card w-full max-w-sm shadow-drop">
        <h1 className="mb-xxs text-display-sm text-ink">创建管理员账户</h1>
        <p className="mb-lg text-caption text-body">这是首次启动引导，账户只会被创建一次。</p>
        <label className="label">用户名</label>
        <input className="input mt-xxs mb-sm" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label className="label">密码（≥ 8 位）</label>
        <input type="password" className="input mt-xxs mb-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="label">确认密码</label>
        <input type="password" className="input mt-xxs mb-base" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {err && <p className="mb-sm text-caption text-error">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '创建中…' : '创建账户'}</button>
      </form>
    </div>
  );
}
