import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { write } from '../api';
import { Header, Field, ErrorNote } from '../components/ui';
export function Forgot() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function requestCode() {
    setBusy(true);
    setError('');
    try {
      const res = await write<{ ok: boolean; dev_code?: string }>('/auth/reset/request', 'POST', {
        email,
      });
      setDevCode(res.dev_code ?? '');
      setStep('reset');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel auth-panel">
      <Header title="找回密码" sub="通过校园邮箱验证码重置登录密码。" />
      {step === 'request' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
        >
          <Field label="校园邮箱">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@mails.tsinghua.edu.cn"
            />
          </Field>
          <ErrorNote error={error} />
          <button className="btn" disabled={busy}>
            {busy ? '发送中…' : '发送重置码'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await write<{ ok: boolean }>('/auth/reset/confirm', 'POST', {
                email,
                code,
                password,
              });
              navigate('/auth', { replace: true });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="校园邮箱">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="验证码">
            <input
              inputMode="numeric"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6 位数字"
            />
          </Field>
          {devCode && <div className="notice success">开发态验证码：{devCode}</div>}
          <Field label="新密码（至少 8 位）">
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
          <div className="actions">
            <button type="button" className="btn secondary" disabled={busy} onClick={() => setStep('request')}>
              上一步
            </button>
            <button className="btn" disabled={busy}>
              {busy ? '重置中…' : '重置密码'}
            </button>
          </div>
        </form>
      )}
      <p className="small muted" style={{ marginTop: 20 }}>
        想起密码了？<Link className="link" to="/auth">返回登录</Link>
      </p>
    </div>
  );
}
