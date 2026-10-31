import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { write } from '../api';
import { useSession } from '../context';
import type { User } from '../types';
import { Header, Field, ErrorNote, tagsFrom } from '../components/ui';
export function Profile({ settings = false }: { settings?: boolean }) {
  const { user, setUser, toast, logout } = useSession(),
    navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    name: user!.name,
    dept: user!.dept ?? '',
    year: user!.year ?? '',
    bio: user!.bio ?? '',
    tags: user!.tags ?? [],
    searchable: !!user!.searchable,
    public_posts: !!user!.public_posts,
    public_teams: !!user!.public_teams,
  }));
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Header
        title={settings ? '账号设置' : '个人资料'}
        sub={settings ? '管理账号与资料公开范围。' : '完善你的介绍，让合作从了解开始。'}
      >
        <Link className="btn secondary" to={'/person/' + user!.id}>
          查看对外主页
        </Link>
      </Header>
      <div className="panel">
        <div className="actions">
          <span className="avatar lg">{user!.name[0]}</span>
          <div>
            <b>{user!.name}</b>
            <p className="small">{user!.verified ? '校园身份已认证' : '待校园认证'} · 本人账号</p>
          </div>
        </div>
      </div>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            setUser(await write<User>('/auth/me', 'PATCH', form));
            toast('资料已保存');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {settings ? (
          <>
            <h2>隐私设置</h2>
            {(
              [
                ['searchable', '允许通过昵称、技能或兴趣找到我'],
                ['public_posts', '公开我发布的招募'],
                ['public_teams', '公开我的组队历史'],
              ] as const
            ).map(([key, label]) => (
              <label className="row" key={key}>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <p className="small muted" style={{ margin: '16px 0' }}>
              申请记录及补充资料始终保持私有。
            </p>
          </>
        ) : (
          <>
            <div className="formgrid">
              {(
                [
                  ['name', '昵称 *'],
                  ['dept', '院系'],
                  ['year', '年级'],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    required={key === 'name'}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </Field>
              ))}
              <Field label="技能与兴趣标签">
                <input
                  defaultValue={form.tags.join(', ')}
                  onBlur={(e) => setForm({ ...form, tags: tagsFrom(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="个人简介">
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
          </>
        )}
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>
          {busy ? '保存中…' : '保存' + (settings ? '设置' : '资料')}
        </button>
      </form>
      {settings && (
        <div className="panel">
          <h2>登录账号</h2>
          <p style={{ marginBottom: 16 }}>{user!.email}</p>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await logout();
                navigate('/discover');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </>
  );
}
