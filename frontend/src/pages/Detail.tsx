import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, write } from '../api';
import { useSession } from '../context';
import type { Post, Role } from '../types';
import { Badge, Tags, LoadState, Modal, Field, ErrorNote, SafeLink, date, Avatar, LoginPromptModal } from '../components/ui';
const extras = [
  ['contact', '招募者联系方式'],
  ['eventIntro', '赛事 / 活动介绍'],
  ['mentor', '导师介绍'],
  ['outcome', '预期成果'],
  ['attachmentInfo', '参考资料 / 附件说明'],
] as const;
export function Detail() {
  const { id } = useParams(),
    data = useData<Post>('/posts/' + id),
    { user, toast } = useSession(),
    navigate = useNavigate();
  const [join, setJoin] = useState(false),
    [role, setRole] = useState<Role>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [message, setMessage] = useState(''),
    [experience, setExperience] = useState(''),
    [portfolio, setPortfolio] = useState('');
  const [loginAsk, setLoginAsk] = useState(false),
    [favState, setFavState] = useState<boolean | null>(null),
    [adminReason, setAdminReason] = useState('');
  const post = data.data;
  if (!post) return <LoadState {...data} retry={data.refresh} />;
  const ended = post.status === 'ended',
    own = user?.id === post.owner_id,
    isFav = favState ?? post.is_favorite,
    takenDown = post.end_reason === 'taken_down';
  function authAction(action: () => void) {
    if (!user) setLoginAsk(true);
    else action();
  }
  async function favorite() {
    setBusy(true);
    try {
      const next = !isFav;
      await write('/posts/' + id + '/favorite', next ? 'PUT' : 'DELETE');
      setFavState(next);
      if (next) toast('可以在个人中心查看收藏记录！', 1000);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adminTakedown() {
    setBusy(true);
    try {
      await write(`/admin/posts/${id}/takedown`, 'POST', { reason: adminReason.trim() });
      setAdminReason('');
      toast('招募已下架，可在本页撤回下架');
      data.refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function adminRestore() {
    setBusy(true);
    try {
      await write(`/admin/posts/${id}/restore`, 'POST');
      toast('招募已恢复上架');
      data.refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="crumb">
        <Link className="link" to="/discover">
          发现组队
        </Link>{' '}
        / {post.category} / 招募详情
      </div>
      <div className="columns">
        <section>
          <div className="panel">
            <div className="between">
              <Tags values={[post.category, ...post.tags]} />
              <Badge color={ended ? 'gray' : 'green'}>
                {ended
                  ? '已结束 · ' +
                    ({ filled: '已招满', expired: '已截止', manual: '提前结束', taken_down: '已下架' }[
                      post.end_reason ?? ''
                    ] ?? '')
                  : '招募中'}
              </Badge>
            </div>
            <h1 className="title">{post.title}</h1>
            <p className="small">
              发布于 {date(post.created_at)} · 截止 {date(post.deadline)}
            </p>
            {post.updated_at !== post.created_at && (
              <p className="small">更新于 {date(post.updated_at)}</p>
            )}
            <p className="small" style={{ marginTop: 8 }}>
              活动安排：{post.event_time ? date(post.event_time) : '时间待定'} /{' '}
              {post.place || '地点待定'}
            </p>
            {ended && (
              <div className="notice warn">
                {takenDown ? '该招募已被管理员下架。' : '招募已结束，录取结果已锁定。'}
              </div>
            )}
            <h2 style={{ margin: '28px 0 13px' }}>关于这次合作</h2>
            <div className="bodycopy">{post.description}</div>
          </div>
          {post.roles.length > 0 && (
            <div className="panel">
              <h2>招募岗位</h2>
              {post.roles.map((r) => (
                <div className="role" key={r.id}>
                  <div className="between">
                    <h3>{r.name}</h3>
                    <Badge>
                      {r.accepting === false ? '已停止接收申请' : r.accepted >= r.capacity
                        ? '岗位已满'
                        : '剩余 ' + (r.capacity - r.accepted) + ' 名'}
                    </Badge>
                  </div>
                  <p>{r.description}</p>
                  <Tags values={r.tags} />
                  <div className="progress">
                    <span style={{ width: `${(r.accepted / r.capacity) * 100}%` }} />
                  </div>
                  <div className="between">
                    <span className="small muted">
                      已录取 {r.accepted} / {r.capacity} 人
                    </span>
                    {!own && (
                      <button
                        className="btn"
                        disabled={ended || r.accepting === false || r.accepted >= r.capacity}
                        onClick={() => authAction(() => {
                          setRole(r);
                          setJoin(true);
                        })}
                      >
                        {ended ? '招募已结束' : '申请此岗位'}
                      </button>
                    )}
                    {own && <span className="small muted">本人招募 · 可在右侧管理申请</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(Object.entries(post.extras).some(([key, value]) => key === 'items' ? post.extras.items?.length : Boolean(value)) || post.attachment) && (
            <div className="panel">
              <h2>更多信息</h2>
              <div className="extra-grid">
                {post.extras.items?.map((item, index) => (
                  <div className="extra-item" key={index}>
                    <strong>{item.title}</strong>
                    {item.type === 'text' ? <p className="bodycopy">{item.content}</p> : item.type === 'link' ? (
                      <SafeLink url={item.content}>{item.content}</SafeLink>
                    ) : (
                      <a href={`/api/posts/${post.id}/attachments/${item.attachment_id}`} download>
                        {post.attachments?.find((a) => a.id === item.attachment_id)?.filename || '下载附件'}
                      </a>
                    )}
                  </div>
                ))}
                {extras.map(
                  ([key, label]) =>
                    post.extras[key] && (
                      <div className="extra-item" key={key}>
                        <strong>{label}</strong>
                        <p>{post.extras[key]}</p>
                      </div>
                    ),
                )}
                {post.extras.activityLink && (
                  <div className="extra-item">
                    <strong>活动链接</strong>
                    <SafeLink url={post.extras.activityLink}>打开活动页面</SafeLink>
                  </div>
                )}
                {post.extras.attachmentLink && (
                  <div className="extra-item">
                    <strong>参考附件</strong>
                    <SafeLink url={post.extras.attachmentLink}>查看附件</SafeLink>
                  </div>
                )}
                {post.attachment && (
                  <div className="extra-item">
                    <strong>上传的附件</strong>
                    <a href={'/api/posts/' + post.id + '/attachment'} download>
                      {post.attachment.filename}（{(post.attachment.size / 1024 / 1024).toFixed(2)}{' '}
                      MB）
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
        <aside>
          <div className="panel">
            <div className="actions">
              <Avatar name={post.owner.name} url={post.owner.avatar_url} className="lg" />
              <div>
                <h3>{post.owner.name}</h3>
                <p className="small">
                  {post.owner.dept ? post.owner.dept + ' · ' + post.owner.year : '发布者'}
                </p>
              </div>
            </div>
            <p className="small" style={{ margin: '18px 0' }}>
              {post.owner.bio}
            </p>
            <div className="actions">
              <Link className="btn secondary" to={'/person/' + post.owner_id}>
                查看主页
              </Link>
              {!own && (
                <Link className="btn" to={'/chats?peer=' + post.owner_id}>
                  私信
                </Link>
              )}
            </div>
          </div>
          <div className="panel">
            <h3>参与招募</h3>
            <p className="small" style={{ margin: '12px 0' }}>
              点击「一键参与」后在弹窗中选择岗位并提交申请。
            </p>
            {own ? (
              <Link className="btn" to={'/posts/' + id + '/applications'}>
                管理申请
              </Link>
            ) : (
              <button
                className="btn"
                disabled={ended}
                onClick={() => authAction(() => setJoin(true))}
              >
                {ended ? '招募已结束' : '一键参与'}
              </button>
            )}
            {!own && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => authAction(() => void favorite())}
                >
                  {isFav ? '★ 已收藏' : '☆ 收藏招募'}
                </button>
              </div>
            )}
          </div>
          {user?.is_admin && !own && (
            <div className="panel">
              <h3>管理操作</h3>
              {takenDown ? (
                <>
                  <div className="notice warn" style={{ margin: '12px 0' }}>
                    该招募已被下架，可恢复上架。
                  </div>
                  <button className="btn secondary" disabled={busy} onClick={() => void adminRestore()}>
                    恢复上架
                  </button>
                </>
              ) : post.status === 'open' ? (
                <>
                  <Field label="下架理由（必填）">
                    <textarea
                      value={adminReason}
                      maxLength={1000}
                      onChange={(e) => setAdminReason(e.target.value)}
                    />
                  </Field>
                  <button
                    className="btn danger"
                    disabled={busy || !adminReason.trim()}
                    onClick={() => void adminTakedown()}
                  >
                    下架招募
                  </button>
                </>
              ) : (
                <p className="small muted">仅招募中的招募可以下架。</p>
              )}
            </div>
          )}
          <div className="panel">
            <h3>申请情况</h3>
            <p className="small" style={{ marginTop: 12 }}>
              目前有 {post.pending_count} 人申请中。申请资料仅发布者可查看。
            </p>
          </div>
          {own && (
            <div className="panel">
              <h3>发布者工具</h3>
              <div className="actions">
                  <Link className="btn secondary" to={'/edit/' + id}>
                    编辑招募
                  </Link>
                <button className="btn secondary" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const draft = await write<{ id: number }>(`/posts/${id}/copy-draft`, 'POST');
                    navigate('/publish?draft=' + draft.id);
                  } catch (error) { toast((error as Error).message); }
                  finally { setBusy(false); }
                }}>复制为新招募</button>
                <Link className="btn secondary" to={'/posts/' + id + '/applications'}>
                  管理申请
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
      {join && (
        <Modal
          title={'一键参与 · ' + post.title}
          onClose={() => {
            setJoin(false);
            setRole(undefined);
            setError('');
          }}
        >
          {post.roles.length === 0 ? (
            <div className="notice">该招募未设置岗位（通知 / 问卷类内容），暂不接受申请，可通过私信与发布者沟通。</div>
          ) : !role ? (
            <>
              <div className="notice">选择一个岗位提交申请；不同岗位可分别申请。</div>
              {post.roles.map((r) => (
                <div className="role" key={r.id}>
                  <div className="between">
                    <h3>{r.name}</h3>
                    <Badge>
                      {r.accepting === false ? '已停止接收申请' : r.accepted >= r.capacity
                        ? '岗位已满'
                        : '剩余 ' + (r.capacity - r.accepted) + ' 名'}
                    </Badge>
                  </div>
                  <p>{r.description}</p>
                  <Tags values={r.tags} />
                  <div className="progress">
                    <span style={{ width: `${(r.accepted / r.capacity) * 100}%` }} />
                  </div>
                  <div className="between">
                    <span className="small muted">
                      已录取 {r.accepted} / {r.capacity} 人
                    </span>
                    <button
                      className="btn"
                      disabled={r.accepting === false || r.accepted >= r.capacity}
                      onClick={() => setRole(r)}
                    >
                      申请此岗位
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await write('/posts/' + id + '/applications', 'POST', {
                    role_id: role.id,
                    message,
                    experience,
                    portfolio,
                  });
                  setJoin(false);
                  setRole(undefined);
                  setMessage('');
                  setExperience('');
                  setPortfolio('');
                  toast('申请已提交，等待审核');
                  data.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3 style={{ margin: '18px 0' }}>申请岗位：{role.name}</h3>
              <Field label="申请留言（选填）">
                <textarea
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </Field>
              <Field label="相关经历（选填）">
                <textarea
                  value={experience}
                  maxLength={3000}
                  onChange={(e) => setExperience(e.target.value)}
                />
              </Field>
              <Field label="简历 / 作品链接（选填）">
                <input
                  type="url"
                  value={portfolio}
                  onChange={(e) => setPortfolio(e.target.value)}
                  placeholder="https://"
                />
              </Field>
              <p className="small muted">补充资料仅本人和招募发布者可见。</p>
              <ErrorNote error={error} />
              <div className="actions" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => setRole(undefined)}
                >
                  返回岗位
                </button>
                <button className="btn" disabled={busy}>
                  {busy ? '提交中…' : '提交申请'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
      <LoginPromptModal
        open={loginAsk}
        onClose={() => setLoginAsk(false)}
        returnTo={'/detail/' + id}
      />
    </>
  );
}
