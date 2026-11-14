import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { write } from '../api';
import { useSession } from '../context';
import type { User } from '../types';
import { Header, Field, ErrorNote } from '../components/ui';
export function Register() {
  const { setUser } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel auth-panel">
      <Header title="创建 CampusCrew 账号" sub="使用校园邮箱注册，注册后即可登录并完成校园认证。" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            setUser(await write<User>('/auth/register', 'POST', { email, password, name }));
            navigate('/verify', { replace: true });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="校园邮箱">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@mails.tsinghua.edu.cn"
          />
        </Field>
        <Field label="昵称">
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="密码（至少 8 位）">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>
          {busy ? '注册中…' : '注册并登录'}
        </button>
      </form>
      <p className="small muted" style={{ marginTop: 20 }}>
        已有账号？<Link className="link" to="/auth">返回登录</Link>
      </p>
    </div>
  );
}
