import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { write } from '../api';
import { useSession } from '../context';
import type { User } from '../types';
import { Header, Field, ErrorNote } from '../components/ui';
export function Auth() {
  const { setUser } = useSession(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="panel auth-panel">
      <Header title="欢迎回到 CampusCrew" sub="用校园身份，找到同行伙伴。" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            setUser(await write<User>('/auth/login', 'POST', { email, password }));
            const target = params.get('return');
            navigate(target?.startsWith('/') && !target.startsWith('//') ? target : '/discover', {
              replace: true,
            });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="邮箱">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="密码">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
      <p className="small muted" style={{ marginTop: 20 }}>
        校园邮箱注册与找回密码尚未开放。
      </p>
    </div>
  );
}
