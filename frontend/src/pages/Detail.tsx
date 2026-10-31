import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, write } from '../api';
import { useSession } from '../context';
import type { Post, Role } from '../types';
import { Badge, Tags, LoadState, Modal, Field, ErrorNote, SafeLink, date } from '../components/ui';
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
  const post = data.data;
  if (!post) return <LoadState {...data} retry={data.refresh} />;
  const ended = post.status === 'ended',
    own = user?.id === post.owner_id;
  function authAction(action: () => void) {
    if (!user) navigate('/auth?return=' + encodeURIComponent('/detail/' + id));
    else action();
  }
  async function favorite() {
    setBusy(true);
    try {
      await write('/posts/' + id + '/favorite', post!.is_favorite ? 'DELETE' : 'PUT');
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
                    ({ filled: '已招满', expired: '已截止', manual: '提前结束' }[
                      post.end_reason ?? ''
                    ] ?? '')
                  : '招募中'}
              </Badge>
            </div>
            <h1 className="title">{post.title}</h1>
            <p className="small">
              发布于 {date(post.created_at)} · 截止 {date(post.deadline)}
            </p>
            <p className="small" style={{ marginTop: 8 }}>
              活动安排：{post.event_time ? date(post.event_time) : '时间待定'} /{' '}
              {post.place || '地点待定'}
            </p>
            {ended && <div className="notice warn">招募已结束，录取结果已锁定。</div>}
            <h2 style={{ margin: '28px 0 13px' }}>关于这次合作</h2>
            <div className="bodycopy">{post.description}</div>
          </div>
          {Object.values(post.extras).some(Boolean) && (
            <div className="panel">
              <h2>更多信息</h2>
              <div className="extra-grid">
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
              </div>
            </div>
          )}
        </section>
        <aside>
          <div className="panel">
            <div className="actions">
              <span className="avatar lg">{post.owner.name[0]}</span>
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
          </div>
          <div className="panel">
            <h3>申请情况</h3>
            <p className="small" style={{ marginTop: 12 }}>
              目前有 {post.pending_count} 人申请中。申请资料仅发布者可查看。
            </p>
          </div>
          <div className="panel">
            <h3>把想法留在这里</h3>
            <p className="small" style={{ margin: '12px 0' }}>
              收藏后可在个人中心回看，已结束招募也会保留。
            </p>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => authAction(() => void favorite())}
            >
              {post.is_favorite ? '★ 已收藏' : '☆ 收藏招募'}
            </button>
          </div>
          {own && (
            <div className="panel">
              <h3>发布者工具</h3>
              <div className="actions">
                <Link className="btn secondary" to={'/edit/' + id}>
                  编辑招募
                </Link>
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
          {!role ? (
            <>
              <div className="notice">选择一个岗位提交申请；不同岗位可分别申请。</div>
              {post.roles.map((r) => (
                <div className="role" key={r.id}>
                  <div className="between">
                    <h3>{r.name}</h3>
                    <Badge>
                      {r.accepted >= r.capacity
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
                      disabled={r.accepted >= r.capacity}
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
    </>
  );
}
