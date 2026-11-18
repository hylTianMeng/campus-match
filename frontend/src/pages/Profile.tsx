import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { uploadAvatar, removeAvatar, write } from '../api';
import { useSession } from '../context';
import type { User, ResourceItem } from '../types';
import { ResourceEditor } from '../components/ResourceEditor';
import { Header, Field, ErrorNote, Modal, Avatar, tagsFrom } from '../components/ui';
export function Profile({ settings = false }: { settings?: boolean }) {
  const { user, setUser, toast } = useSession();
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  // 初始值用空字段兜底，避免 user 为 null 时崩溃；真实数据由下方 useEffect 填充。
  const [form, setForm] = useState(() => ({
    name: '',
    dept: '',
    year: '',
    bio: '',
    resources: [] as ResourceItem[],
    tags: [] as string[],
    searchable: true,
    public_posts: true,
    public_teams: false,
  }));
  // 标签输入框用受控值，确保切换账号后能正确刷新显示（不受 defaultValue 只挂载一次限制）。
  const [tagsText, setTagsText] = useState('');
  // user 就绪或切换账号（id 变化）时，用最新账号资料重置表单。这是修复“跨标签页登录
  // 态同步后，旧账号资料被 PATCH 到新账号”的核心：依赖 user?.id 而非 user，避免每次
  // 输入/保存(setUser)都重置表单，干扰用户正在编辑的内容。
  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      dept: user.dept ?? '',
      year: user.year ?? '',
      bio: user.bio ?? '',
      resources: user.resources ?? [],
      tags: user.tags ?? [],
      searchable: !!user.searchable,
      public_posts: !!user.public_posts,
      public_teams: !!user.public_teams,
    });
    setTagsText((user.tags ?? []).join(', '));
    setUploading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delPassword, setDelPassword] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
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
          <Avatar name={user!.name} url={avatarPreview || user!.avatar_url} className="lg" />
          <div>
            <b>{user!.name}</b>
            <p className="small">{user!.verified ? '校园身份已认证' : '待校园认证'} · 本人账号</p>
          </div>
        </div>
        {!settings && (
          <div className="actions" style={{ marginTop: 16 }}>
            <label className="btn secondary" htmlFor="avatar-file" style={{ cursor: 'pointer' }}>
              选择头像
            </label>
            <input
              id="avatar-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAvatarFile(file);
                setAvatarPreview(file ? URL.createObjectURL(file) : '');
                setAvatarError('');
              }}
            />
            {avatarFile && (
              <button
                className="btn"
                disabled={avatarBusy}
                onClick={async () => {
                  setAvatarBusy(true);
                  setAvatarError('');
                  try {
                    setUser(await uploadAvatar(avatarFile));
                    setAvatarFile(null);
                    setAvatarPreview('');
                    toast('头像已更新');
                  } catch (e) {
                    setAvatarError((e as Error).message);
                  } finally {
                    setAvatarBusy(false);
                  }
                }}
              >
                {avatarBusy ? '上传中…' : '上传头像'}
              </button>
            )}
            {user!.avatar_url && !avatarFile && (
              <button
                className="btn secondary"
                disabled={avatarBusy}
                onClick={async () => {
                  setAvatarBusy(true);
                  setAvatarError('');
                  try {
                    setUser(await removeAvatar());
                    toast('头像已移除');
                  } catch (e) {
                    setAvatarError((e as Error).message);
                  } finally {
                    setAvatarBusy(false);
                  }
                }}
              >
                {avatarBusy ? '移除中…' : '移除头像'}
              </button>
            )}
          </div>
        )}
        <ErrorNote error={avatarError} />
      </div>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (uploading) return;
          setBusy(true);
          setError('');
          try {
            const payload = {
              ...form,
              resources: settings
                ? undefined
                : form.resources.map(({ filename: _filename, ...item }) => item),
            };
            setUser(await write<User>('/auth/me', 'PATCH', payload));
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
              申请记录及申请补充资料始终保持私有。主动添加到个人主页的网页和附件会向认证同学展示。
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
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
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
            <ResourceEditor
              purpose="profile"
              key={user!.id}
              value={form.resources}
              onChange={(resources) => setForm((current) => ({ ...current, resources }))}
              busy={busy}
              onUploading={setUploading}
            />
          </>
        )}
        <ErrorNote error={error} />
        <button className="btn" disabled={busy || uploading}>
          {busy ? '保存中…' : '保存' + (settings ? '设置' : '资料')}
        </button>
      </form>
      {settings && (
        <>
          <div className="panel">
            <h2>注销账号</h2>
            <p style={{ marginBottom: 16 }}>
              注销后将匿名化账号资料并使登录失效。已发送消息、申请历史和治理记录会继续保留，供相关参与者回看及必要核查。
            </p>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                setDelPassword('');
                setDelError('');
                setDeleting(true);
              }}
            >
              注销账号
            </button>
          </div>
        </>
      )}
      {deleting && (
        <Modal title="确认注销账号" onClose={() => !delBusy && setDeleting(false)}>
          <p style={{ margin: '18px 0' }}>
            输入登录密码以确认注销。此操作会匿名化你的账号并立即退出登录。
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setDelBusy(true);
              setDelError('');
              try {
                await write('/auth/delete', 'POST', { password: delPassword });
                setDeleting(false);
                setUser(null);
                navigate('/discover', { replace: true });
              } catch (e) {
                setDelError((e as Error).message);
              } finally {
                setDelBusy(false);
              }
            }}
          >
            <Field label="当前密码">
              <input
                type="password"
                required
                value={delPassword}
                onChange={(e) => setDelPassword(e.target.value)}
              />
            </Field>
            <ErrorNote error={delError} />
            <div className="actions">
              <button
                type="button"
                className="btn secondary"
                disabled={delBusy}
                onClick={() => setDeleting(false)}
              >
                取消
              </button>
              <button className="btn danger" disabled={delBusy}>
                {delBusy ? '注销中…' : '确认注销'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
