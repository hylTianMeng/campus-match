import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, write } from '../api';
import { useSession } from '../context';
import { Header, Empty, LoadState, ErrorNote, Modal, Field, Badge } from '../components/ui';
interface AdminUser {
  id: number;
  email: string;
  name: string;
  dept: string;
  year: string;
  verified: boolean;
  banned: boolean;
  is_admin: boolean;
  avatar_url: string | null;
}
export function Admin() {
  const { user, toast } = useSession();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [banned, setBanned] = useState('');
  const [target, setTarget] = useState<AdminUser>();
  const [action, setAction] = useState<'ban' | 'unban'>('ban');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams({ q: query, banned });
  const data = useData<AdminUser[]>(user?.is_admin ? '/admin/users?' + params.toString() : null);
  if (user?.is_admin === false) {
    return (
      <Empty title="需要管理员权限">
        <Link className="btn secondary" to="/discover">
          返回发现页
        </Link>
      </Empty>
    );
  }
  async function submit() {
    if (!target) return;
    setBusy(true);
    setError('');
    try {
      await write('/admin/users/' + target.id + '/' + action, 'POST', { reason });
      setTarget(undefined);
      setReason('');
      toast(action === 'ban' ? '已封禁该用户' : '已解封该用户');
      data.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title="后台用户管理" sub="查看用户并管理封禁状态。操作会记录在审计日志中。">
        <Link className="btn secondary" to="/discover">
          返回发现页
        </Link>
      </Header>
      <div className="panel">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q);
          }}
        >
          <input
            aria-label="搜索用户"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="昵称或邮箱"
          />
          <select aria-label="封禁筛选" value={banned} onChange={(e) => setBanned(e.target.value)}>
            <option value="">全部状态</option>
            <option value="0">正常</option>
            <option value="1">已封禁</option>
          </select>
          <button className="btn">搜索</button>
        </form>
      </div>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty title="没有符合条件的用户" />}
      {Boolean(data.data?.length) && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>昵称</th>
                <th>邮箱</th>
                <th>院系</th>
                <th>状态</th>
                <th>角色</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((u) => (
                <tr key={u.id}>
                  <td data-label="ID">{u.id}</td>
                  <td data-label="昵称">{u.name}</td>
                  <td data-label="邮箱">{u.email}</td>
                  <td data-label="院系">{u.dept || '—'}</td>
                  <td data-label="状态">
                    <Badge color={u.banned ? 'red' : 'green'}>{u.banned ? '已封禁' : '正常'}</Badge>{' '}
                    <Badge color={u.verified ? 'green' : 'gray'}>
                      {u.verified ? '已认证' : '未认证'}
                    </Badge>
                  </td>
                  <td data-label="角色">{u.is_admin ? '管理员' : '普通用户'}</td>
                  <td data-label="操作">
                    <div className="actions">
                      {u.banned ? (
                        <button
                          className="btn secondary"
                          disabled={busy}
                          onClick={() => {
                            setTarget(u);
                            setAction('unban');
                            setReason('');
                            setError('');
                          }}
                        >
                          解封
                        </button>
                      ) : (
                        <button
                          className="btn danger"
                          disabled={busy || u.is_admin || u.id === user?.id}
                          onClick={() => {
                            setTarget(u);
                            setAction('ban');
                            setReason('');
                            setError('');
                          }}
                        >
                          封禁
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <Modal
          title={action === 'ban' ? '封禁用户' : '解封用户'}
          onClose={() => !busy && setTarget(undefined)}
        >
          <p style={{ margin: '18px 0' }}>
            {action === 'ban'
              ? `即将封禁「${target.name}」（${target.email}），封禁后其账号转为只读。`
              : `即将解封「${target.name}」（${target.email}）。`}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label={action === 'ban' ? '封禁原因（必填）' : '操作说明（选填）'}>
              <textarea
                required={action === 'ban'}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <div className="actions">
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setTarget(undefined)}
              >
                取消
              </button>
              <button className={'btn ' + (action === 'ban' ? 'danger' : '')} disabled={busy}>
                {busy ? '处理中…' : '确认' + (action === 'ban' ? '封禁' : '解封')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
