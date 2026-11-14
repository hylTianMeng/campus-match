import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { write } from '../api';
import { useSession } from '../context';
import type { User } from '../types';
import { Header, Field, ErrorNote } from '../components/ui';
export function Verify() {
  const { user, setUser } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  if (user.verified) {
    return (
      <div className="panel auth-panel">
        <Header title="校园认证已完成" sub="你的校园身份已通过验证。" />
        <div className="notice success">已认证邮箱：{user.email}</div>
        <Link className="btn" to="/discover">
          进入 CampusCrew
        </Link>
      </div>
    );
  }
  return (
    <div className="panel auth-panel">
      <Header title="完成校园认证" sub={'验证码将发送至 ' + user.email + '。'} />
      <div className="notice">完成校园认证后才能发布招募、申请岗位或发送私信。</div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            setUser(await write<User>('/auth/verify/check', 'POST', { code }));
            navigate('/discover', { replace: true });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
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
        <ErrorNote error={error} />
        <div className="actions">
          <button className="btn" disabled={busy || !code}>
            {busy ? '校验中…' : '完成认证'}
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const res = await write<{ ok: boolean; dev_code?: string }>('/auth/verify/send');
                setDevCode(res.dev_code ?? '');
                setSent(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {sent ? '重新发送验证码' : '发送验证码'}
          </button>
        </div>
      </form>
      <p className="small muted" style={{ marginTop: 20 }}>
        没有收到？检查垃圾邮件，或稍后重新发送。
      </p>
    </div>
  );
}
