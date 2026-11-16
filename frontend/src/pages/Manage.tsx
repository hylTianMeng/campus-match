import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData, write } from '../api';
import { useSession } from '../context';
import type { Application, Draft, Post } from '../types';
import { PostCard } from '../components/PostCard';
import {
  Header,
  Empty,
  LoadState,
  Modal,
  Field,
  ErrorNote,
  Badge,
  SafeLink,
  date,
  statusLabel,
} from '../components/ui';
interface Confirmation {
  title: string;
  description: string;
  path: string;
  method?: string;
  action?: string;
  reason?: boolean;
  reapply?: boolean;
  onForce?: () => void;
}
function useConfirmation(refresh: () => void) {
  const [dialog, setDialog] = useState<Confirmation>(),
    [reason, setReason] = useState(''),
    [allowReapply, setAllowReapply] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { toast } = useSession();
  const ask = (next: Confirmation) => {
    setReason('');
    setError('');
    setAllowReapply(true);
    setDialog(next);
  };
  const modal = dialog && (
    <Modal
      title={dialog.title}
      onClose={() => {
        if (!busy) setDialog(undefined);
      }}
    >
      <p style={{ margin: '18px 0' }}>{dialog.description}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await write(
              dialog.path,
              dialog.method ?? 'POST',
              dialog.action
                ? {
                    action: dialog.action,
                    reason,
                    ...(dialog.reapply ? { allow_reapply: allowReapply } : {}),
                  }
                : {},
            );
            setDialog(undefined);
            toast('操作已完成');
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {dialog.reason && (
          <Field label="操作原因（必填）">
            <textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        {dialog.reapply && (
          <label className="small" style={{ display: 'block', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={allowReapply}
              onChange={(e) => setAllowReapply(e.target.checked)}
            />{' '}
            允许该用户再次申请
          </label>
        )}
        <ErrorNote error={error} />
        <div className="actions">
          {dialog.onForce && error.includes('已有申请历史') && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setDialog(undefined);
                dialog.onForce?.();
              }}
            >
              仍要删除
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => setDialog(undefined)}
          >
            取消
          </button>
          <button className="btn" disabled={busy}>
            {busy ? '处理中…' : '确认' + dialog.title}
          </button>
        </div>
      </form>
    </Modal>
  );
  return { ask, modal };
}
function ForceDeleteModal({
  post,
  onClose,
  onDeleted,
}: {
  post: { id: number; title: string };
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [progress, setProgress] = useState(0),
    [error, setError] = useState('');
  const rafRef = useRef<number | undefined>(undefined);
  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    setProgress(0);
  };
  useEffect(() => stop, []);
  const start = () => {
    setError('');
    if (rafRef.current) return;
    const startedAt = Date.now();
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - startedAt) / 3000) * 100);
      setProgress(pct);
      if (pct >= 100) {
        rafRef.current = undefined;
        write('/posts/' + post.id + '?force=true', 'DELETE')
          .then(onDeleted)
          .catch((e: Error) => {
            setError(e.message);
            setProgress(0);
          });
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };
  return (
    <Modal title="强制删除招募" onClose={onClose}>
      <p style={{ margin: '18px 0' }}>
        “{post.title}”存在申请记录，强制删除会一并移除全部申请与录取记录，且不可恢复。
      </p>
      <p className="small muted">请长按下方按钮 3 秒以确定删除。</p>
      <div style={{ margin: '16px 0' }}>
        <button
          type="button"
          className="btn danger"
          style={{ width: '100%', position: 'relative', overflow: 'hidden' }}
          onPointerDown={start}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onContextMenu={(e) => e.preventDefault()}
        >
          {progress > 0 && (
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: progress + '%',
                background: 'rgba(173, 60, 82, 0.25)',
              }}
            />
          )}
          长按 3 秒确认删除
        </button>
      </div>
      <ErrorNote error={error} />
      <div className="actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          取消
        </button>
      </div>
    </Modal>
  );
}
export function Posts() {
  const data = useData<Post[]>('/me/posts'),
    { ask, modal } = useConfirmation(data.refresh),
    { toast } = useSession(),
    [forceDelete, setForceDelete] = useState<{ id: number; title: string }>();
  return (
    <>
      <Header title="管理发布" sub="查看招募进展，管理岗位申请。">
        <Link className="btn secondary" to="/drafts">
          草稿箱
        </Link>
        <Link className="btn" to="/publish">
          ＋ 发布招募
        </Link>
      </Header>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      <div className="panel">
        {data.data?.map((p) => (
          <div className="row" key={p.id}>
            <div className="grow">
              <h3>
                <Link to={'/detail/' + p.id}>{p.title}</Link>
              </h3>
              <p>
                {p.category} ·{' '}
                {p.status === 'open'
                  ? '招募中'
                  : p.end_reason === 'taken_down'
                    ? '已下架'
                    : '已结束'}{' '}
                · {p.pending_count}{' '}
                人待审核 · 更新于 {date(p.updated_at)}
              </p>
            </div>
            <div className="actions">
              <Link className="btn secondary" to={'/posts/' + p.id + '/applications'}>
                管理申请
              </Link>
                  <Link className="link" to={'/edit/' + p.id}>
                    编辑
                  </Link>
              {p.status === 'open' && (
                <>
                  <button
                    className="link"
                    onClick={() =>
                      ask({
                        title: '提前结束',
                        description:
                          '招募结束后录取结果锁定，不能重新开放。请先处理所有待审核申请。',
                        path: '/posts/' + p.id + '/end',
                      })
                    }
                  >
                    提前结束
                  </button>
                </>
              )}
              <button
                className="link"
                onClick={() =>
                  ask({
                    title: '删除招募',
                    description: '仅从未收到申请的招募可以删除，删除后不可恢复。',
                    path: '/posts/' + p.id,
                    method: 'DELETE',
                    onForce: () => setForceDelete({ id: p.id, title: p.title }),
                  })
                }
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
      {modal}
      {forceDelete && (
        <ForceDeleteModal
          post={forceDelete}
          onClose={() => setForceDelete(undefined)}
          onDeleted={() => {
            setForceDelete(undefined);
            toast('招募已删除');
            data.refresh();
          }}
        />
      )}
    </>
  );
}
export function Drafts() {
  const data = useData<Draft[]>('/drafts'),
    { ask, modal } = useConfirmation(data.refresh),
    { toast } = useSession();
  const copyDraft = async (d: Draft) => {
    try {
      await write('/drafts/' + d.id + '/copy', 'POST');
      toast('已复制草稿');
      data.refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <>
      <Header title="草稿箱" sub="缺项也可以保存。填写时自动保存，也可以手动保存。">
        <Link className="btn" to="/publish">
          ＋ 新建招募
        </Link>
      </Header>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && (
        <Empty title="还没有草稿">
          <Link className="btn" to="/publish">
            创建招募
          </Link>
        </Empty>
      )}
      <div className="panel">
        {data.data?.map((d) => (
          <div className="row" key={d.id}>
            <div className="grow">
              <h3>{d.payload.title || '未命名招募'}</h3>
              <p>
                最近保存：{date(d.updated_at)} · {d.payload.roles?.length ?? 0} 个岗位
              </p>
            </div>
            <div className="actions">
              <Link className="btn secondary" to={'/publish?draft=' + d.id}>
                继续编辑
              </Link>
              <button className="btn secondary" onClick={() => void copyDraft(d)}>
                复制
              </button>
              <button
                className="btn danger"
                onClick={() =>
                  ask({
                    title: '删除草稿',
                    description: '删除后无法恢复。',
                    path: '/drafts/' + d.id,
                    method: 'DELETE',
                  })
                }
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
      {modal}
    </>
  );
}
export function Applications({ team = false }: { team?: boolean }) {
  const { id } = useParams(),
    owner = Boolean(id),
    data = useData<Application[]>(owner ? '/posts/' + id + '/applications' : '/me/applications');
  const { ask, modal } = useConfirmation(data.refresh),
    [banError, setBanError] = useState(''),
    rows = data.data?.filter((a) => !team || a.status === 'accepted');
  const { toast } = useSession();
  const decide = (
    a: Application,
    action: string,
    title: string,
    reason = false,
    reapply = false,
  ) =>
    ask({
      title,
      description: `${a.applicant_name} · ${a.title} · ${a.role_name}。操作以服务器最新状态为准。`,
      path: '/applications/' + a.id + '/decision',
      action,
      reason,
      reapply,
    });
  const toggleBan = async (a: Application) => {
    setBanError('');
    try {
      await write('/posts/' + a.post_id + '/application-ban', 'PUT', {
        user_id: a.user_id,
        banned: !a.reapply_banned,
      });
      toast(a.reapply_banned ? '已允许该用户再次申请' : '已禁止该用户再次申请');
      data.refresh();
    } catch (e) {
      setBanError((e as Error).message);
    }
  };
  return (
    <>
      <Header
        title={owner ? '申请管理' : team ? '组队历史' : '当前申请'}
        sub={
          owner
            ? '申请补充资料仅本人和招募发布者可见。'
            : team
              ? '展示当前仍保持通过的招募与岗位。'
              : '每个岗位独立申请和审核，历史记录保留。'
        }
      >
        {owner && (
          <Link className="btn secondary" to="/posts">
            返回管理发布
          </Link>
        )}
      </Header>
      <LoadState {...data} retry={data.refresh} />
      {rows?.length === 0 && <Empty />}
      {rows?.map((a) => (
        <div className="panel" key={a.id}>
          <div className="between">
            <div>
              <h3>
                <Link to={'/detail/' + a.post_id}>{a.title}</Link>
              </h3>
              <p>
                {a.applicant_name} · {a.role_name} · {date(a.created_at)}
              </p>
            </div>
            <Badge color={a.status === 'accepted' ? 'green' : ''}>{statusLabel[a.status]}</Badge>
          </div>
          <p className="bodycopy" style={{ marginTop: 12 }}>
            留言：{a.message || '无'}
          </p>
          <p className="bodycopy">相关经历：{a.experience || '无'}</p>
          {a.portfolio ? (
            <SafeLink url={a.portfolio}>简历 / 作品</SafeLink>
          ) : (
            <p className="bodycopy">简历 / 作品：无</p>
          )}
          {a.reason && <p className="small muted">{a.reason}</p>}
          {owner && a.status === 'withdrawn' && (
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                className={a.reapply_banned ? 'btn' : 'btn secondary'}
                onClick={() => toggleBan(a)}
              >
                {a.reapply_banned ? '允许再次申请' : '禁止再次申请'}
              </button>
              <span className="small muted">
                {a.reapply_banned
                  ? '该用户目前不能申请此招募'
                  : '该用户目前可以再次申请此招募'}
              </span>
            </div>
          )}
          <ErrorNote error={banError} />
          <details style={{ marginTop: 12 }}>
            <summary>查看操作历史</summary>
            <div className="timeline">
              {a.events.map((e, i) => (
                <p key={i}>
                  {date(e.created_at)} · {e.reason}
                </p>
              ))}
            </div>
          </details>
          {!team && a.post_status === 'open' && (
            <div className="actions" style={{ marginTop: 16 }}>
              {owner ? (
                <>
                  {a.status === 'pending' && (
                    <>
                      <button className="btn" onClick={() => decide(a, 'accept', '通过申请')}>
                        通过
                      </button>
                      <button
                        className="btn secondary"
                        onClick={() => decide(a, 'reject', '拒绝申请', true, true)}
                      >
                        拒绝
                      </button>
                    </>
                  )}
                  {a.status === 'accepted' && (
                    <button
                      className="btn danger"
                      onClick={() => decide(a, 'revoke', '撤销录取', true)}
                    >
                      撤销录取
                    </button>
                  )}
                </>
              ) : (
                <>
                  {a.status === 'pending' && (
                    <button
                      className="btn secondary"
                      onClick={() => decide(a, 'withdraw', '撤回申请')}
                    >
                      撤回申请
                    </button>
                  )}
                  {a.status === 'accepted' && (
                    <button className="btn danger" onClick={() => decide(a, 'give-up', '放弃录取')}>
                      放弃录取
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {modal}
    </>
  );
}
export function Favorites() {
  const data = useData<Post[]>('/me/favorites');
  return (
    <>
      <Header title="我的收藏" sub="已结束招募仍保留在收藏中。" />
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      <div className="grid two">
        {data.data?.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </>
  );
}
