import { useEffect, useState } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { api, useData, write, refreshInbox } from '../api';
import { useSession } from '../context';
import type { Message, Person, ChatMessage, AuditedDirectMessage } from '../types';
import { Header, LoadState, Empty, ErrorNote, Modal, Field, Badge, date } from '../components/ui';
import { BlockButton } from '../components/SafetyActions';
import { MessageBody } from './Messages';

export function AdminNav() {
  return (
    <div className="tabs" aria-label="管理功能">
      {[
        ['/admin', '用户管理'],
        ['/admin/posts', '招募管理'],
        ['/admin/reports', '举报管理'],
        ['/admin/messages', '私信管理'],
        ['/admin/chats', '群聊管理'],
        ['/admin/audits', '访问审计'],
        ['/admin/history', '处罚历史'],
      ].map(([path, label]) => (
        <NavLink end key={path} to={path}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  return user?.is_admin && !user.banned ? (
    <>
      <AdminNav />
      {children}
    </>
  ) : (
    <Empty title="需要正常管理员权限" />
  );
}
function Pager({
  page,
  setPage,
  count,
}: {
  page: number;
  setPage: (value: number) => void;
  count?: number;
}) {
  return (
    <div className="actions">
      <button className="btn secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
        上一页
      </button>
      <span>第 {page + 1} 页</span>
      <button
        className="btn secondary"
        disabled={count === undefined || count < 50}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}

export function BlockList() {
  const data = useData<Person[]>('/blocks');
  return (
    <>
      <Header title="黑名单" sub="对方无法向你私信或申请你的招募，解除后旧申请保持原结果。" />
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      <div className="panel">
        {data.data?.map((p) => (
          <div className="row" key={p.id}>
            <div className="grow">
              <h3>{p.name}</h3>
            </div>
            <BlockButton personId={p.id} onChange={data.refresh} />
          </div>
        ))}
      </div>
    </>
  );
}
interface Report {
  id: number;
  target_type: 'post' | 'user' | 'message' | 'chat_message';
  target_id: number;
  target_summary: string;
  status: string;
  action: string;
  created_at: string;
  reason?: string;
  resolution?: string;
  subject_name?: string;
  admin_id?: number;
  resolved_at?: string;
  conversation?: { sender_id: number; recipient_id: number };
  chat?: { chat_id: number; post_id: number; title: string };
}
const statusName: Record<string, string> = {
  pending: '待处理',
  resolved: '已处理',
  dismissed: '已驳回',
};
export function OwnReports() {
  const [page, setPage] = useState(0),
    data = useData<Report[]>('/me/reports?limit=50&offset=' + page * 50);
  return (
    <>
      <Header title="我的举报" sub="管理员人工核实后会发送处理结果。" />
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      {data.data?.map((r) => (
        <div className="panel" key={r.id}>
          <div className="between">
            <h3>
              举报 #{r.id} · {r.target_summary}
            </h3>
            <Badge>{statusName[r.status]}</Badge>
          </div>
          <p>{date(r.created_at)}</p>
        </div>
      ))}
      <Pager page={page} setPage={setPage} count={data.data?.length} />
    </>
  );
}

export function ReportAdmin() {
  const [status, setStatus] = useState('pending'),
    [type, setType] = useState(''),
    [page, setPage] = useState(0);
  const data = useData<Report[]>(
    '/admin/reports?' +
      new URLSearchParams({ status, target_type: type, limit: '50', offset: String(page * 50) }),
  );
  const [selected, setSelected] = useState<Report>(),
    [action, setAction] = useState('dismiss'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { toast } = useSession();
  return (
    <>
      <Header title="举报管理" sub="核实后处理举报，处罚成功后记录结果。" />
      <div className="actions">
        <select
          aria-label="举报状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="resolved">已处理</option>
          <option value="dismissed">已驳回</option>
        </select>
        <select
          aria-label="举报类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部类型</option>
          <option value="post">招募</option>
          <option value="user">用户</option>
          <option value="message">消息</option>
          <option value="chat_message">群聊消息</option>
        </select>
      </div>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      {data.data?.map((r) => (
        <div className="panel" key={r.id}>
          <div className="between">
            <h3>
              举报 #{r.id} · {r.target_summary}
            </h3>
            <Badge>{statusName[r.status]}</Badge>
          </div>
          <p>
            {r.subject_name} · {date(r.created_at)}
          </p>
          <p className="bodycopy">举报说明：{r.reason}</p>
          {r.target_type === 'post' && (
            <Link className="link" to={'/detail/' + r.target_id}>
              查看招募
            </Link>
          )}
          {r.target_type === 'user' && (
            <Link className="link" to="/admin">
              进入用户管理
            </Link>
          )}
          {r.conversation && (
            <Link
              className="btn secondary"
              to={
                '/admin/messages?first=' +
                r.conversation.sender_id +
                '&second=' +
                r.conversation.recipient_id +
                '&report=' +
                r.id
              }
            >
              填写原因后查看会话证据
            </Link>
          )}
          {r.chat && (
            <Link
              className="btn secondary"
              to={'/admin/chats?chat=' + r.chat.chat_id + '&report=' + r.id}
            >
              填写原因后查看群聊证据
            </Link>
          )}
          {r.resolution && (
            <p>
              处理记录：{r.resolution} · 管理员 #{r.admin_id} · {date(r.resolved_at ?? '')}
            </p>
          )}
          {r.status === 'pending' && (
            <button
              className="btn"
              onClick={() => {
                setSelected(r);
                setReason('');
                setError('');
                setAction('dismiss');
              }}
            >
              核实并处理
            </button>
          )}
        </div>
      ))}
      <Pager page={page} setPage={setPage} count={data.data?.length} />
      {selected && (
        <Modal title={'处理举报 #' + selected.id} onClose={() => !busy && setSelected(undefined)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await write('/admin/reports/' + selected.id + '/resolve', 'POST', {
                  action,
                  reason,
                });
                setSelected(undefined);
                data.refresh();
                refreshInbox();
                toast('举报处理已完成');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="处理方式">
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="dismiss">驳回举报</option>
                <option value="resolve">核实并记录处理</option>
                <option value="ban">核实并封禁用户</option>
                {selected.target_type === 'post' && (
                  <option value="take-down">核实并下架招募</option>
                )}
              </select>
            </Field>
            <Field label="核实结论与内部原因">
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <p className="small muted">
              受处罚者仅收到安全摘要，举报者身份和内部说明保留在管理记录中。
            </p>
            <ErrorNote error={error} />
            <button className="btn" disabled={busy}>
              确认处理
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

interface ModerationPost {
  id: number;
  title: string;
  owner_id: number;
  owner_name: string;
  status: string;
  end_reason: string;
  taken_down: boolean;
  banned: boolean;
  deleted_at: string | null;
  deadline: string;
}
export function PostAdmin() {
  const [q, setQ] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    data = useData<ModerationPost[]>(
      '/admin/posts?' + new URLSearchParams({ q: query, limit: '50', offset: String(page * 50) }),
    );
  const [selected, setSelected] = useState<ModerationPost>(),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const { toast } = useSession();
  return (
    <>
      <Header title="招募管理" sub="独立下架限制与发布者账号状态分别保留。" />
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
          setPage(0);
        }}
      >
        <input aria-label="招募标题" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">搜索</button>
      </form>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.map((p) => (
        <div className="panel" key={p.id}>
          <h3>
            <Link to={'/detail/' + p.id}>{p.title}</Link>
          </h3>
          <p>
            {p.owner_name} · {p.status === 'open' ? '招募中' : '已结束'} · 截止 {date(p.deadline)}
          </p>
          <div className="actions">
            {!!p.taken_down && <Badge color="red">独立下架</Badge>}
            {!!p.banned && <Badge color="red">账号封禁</Badge>}
            {p.deleted_at && <Badge>已注销</Badge>}
            <button
              className="btn secondary"
              disabled={p.status !== 'open' || !!p.deleted_at}
              onClick={() => {
                setSelected(p);
                setReason('');
                setError('');
              }}
            >
              {p.taken_down ? '恢复招募' : '下架招募'}
            </button>
          </div>
        </div>
      ))}
      <Pager page={page} setPage={setPage} count={data.data?.length} />
      {selected && (
        <Modal
          title={selected.taken_down ? '恢复招募' : '下架招募'}
          onClose={() => !busy && setSelected(undefined)}
        >
          <p style={{ margin: '18px 0' }}>
            下架暂停申请与审核，原截止时间保持。恢复时其他账号限制仍然适用，已结束的招募保持结束。
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await write(
                  '/admin/posts/' +
                    selected.id +
                    '/' +
                    (selected.taken_down ? 'restore' : 'take-down'),
                  'POST',
                  { reason },
                );
                setSelected(undefined);
                data.refresh();
                toast('操作已完成');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="操作原因">
              <textarea
                required
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <button className="btn" disabled={busy}>
              确认{selected.taken_down ? '恢复' : '下架'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

interface ConversationSummary {
  first_user_id: number;
  second_user_id: number;
  first_name: string;
  second_name: string;
  message_count: number;
  updated_at: string;
}
interface Audit {
  id: number;
  admin_id: number;
  admin_name?: string;
  first_user_id: number;
  second_user_id: number;
  reason: string;
  created_at: string;
  expires_at: string;
}
export function PrivateMessageAdmin() {
  const [params] = useSearchParams(),
    [q, setQ] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const data = useData<ConversationSummary[]>(
    '/admin/conversations?' +
      new URLSearchParams({ q: query, limit: '50', offset: String(page * 50) }),
  );
  const [pair, setPair] = useState<{
    first_user_id: number;
    second_user_id: number;
    first_name?: string;
    second_name?: string;
  }>(),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [audit, setAudit] = useState<Audit>(),
    [messages, setMessages] = useState<AuditedDirectMessage[]>([]),
    [hasMore, setHasMore] = useState(false),
    [reportReason, setReportReason] = useState('');
  useEffect(() => {
    const first = Number(params.get('first')),
      second = Number(params.get('second'));
    if (first && second) setPair({ first_user_id: first, second_user_id: second });
    setAudit(undefined);
    setMessages([]);
    setReportReason('');
  }, [params]);
  useEffect(() => {
    if (!audit) return;
    const timer = setTimeout(
      () => {
        setAudit(undefined);
        setMessages([]);
        setReportReason('');
        setError('访问授权已失效，请重新填写原因');
      },
      Math.max(0, Date.parse(audit.expires_at) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [audit]);
  return (
    <>
      <Header
        title="私信管理"
        sub="填写核查原因并记录审计后，查看指定会话。访问授权有效期 15 分钟。"
      />
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
          setPage(0);
        }}
      >
        <input aria-label="会话用户昵称" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">搜索会话</button>
      </form>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.map((c) => (
        <div className="row" key={c.first_user_id + ':' + c.second_user_id}>
          <div className="grow">
            <h3>
              {c.first_name} ↔ {c.second_name}
            </h3>
            <p>
              {c.message_count} 条消息 · {date(c.updated_at)}
            </p>
          </div>
          <button
            className="btn secondary"
            onClick={() => {
              setPair(c);
              setReason('');
              setError('');
            }}
          >
            聊天内容审核
          </button>
        </div>
      ))}
      <Pager page={page} setPage={setPage} count={data.data?.length} />
      <ErrorNote error={error} />
      {audit && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>
            已授权会话：{pair?.first_name ?? '用户 #' + audit.first_user_id} ↔{' '}
            {pair?.second_name ?? '用户 #' + audit.second_user_id}
          </h2>
          <p>
            访问审计 #{audit.id} · {audit.reason} · {date(audit.created_at)}
          </p>
          <button
            className="link"
            onClick={() => {
              setAudit(undefined);
              setMessages([]);
              setReportReason('');
            }}
          >
            关闭正文
          </button>
          {reportReason && <p className="bodycopy">举报说明：{reportReason}</p>}
          {messages.map((m) => (
            <div className="role" key={m.id}>
              <p>
                消息 #{m.id} · {m.sender_name ?? '用户 #' + m.sender_id} →{' '}
                {m.recipient_name ?? '用户 #' + m.recipient_id} · {date(m.created_at)}
              </p>
              <div className="bodycopy">
                <MessageBody body={m.body} />
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const rows = await api<Message[]>(
                    '/admin/conversations/access/' +
                      audit.id +
                      '?after=' +
                      messages[messages.length - 1].id,
                  );
                  setMessages((prev) => [...prev, ...rows]);
                  setHasMore(rows.length === 200);
                } catch (e) {
                  setError((e as Error).message);
                  setAudit(undefined);
                  setMessages([]);
                } finally {
                  setBusy(false);
                }
              }}
            >
              加载后续消息
            </button>
          )}
        </div>
      )}
      {pair && (
        <Modal title="私信访问原因" onClose={() => !busy && setPair(undefined)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setAudit(undefined);
              setMessages([]);
              setReportReason('');
              try {
                const result = await write<{ audit: Audit; messages: AuditedDirectMessage[] }>(
                  '/admin/conversations/access',
                  'POST',
                  {
                    ...{ first_user_id: pair.first_user_id, second_user_id: pair.second_user_id },
                    reason,
                  },
                );
                setAudit(result.audit);
                setMessages(result.messages);
                setHasMore(result.messages.length === 200);
                setPair(undefined);
                const reportId = Number(params.get('report'));
                if (reportId) {
                  const evidence = await api<{ reason: string; resolution: string }>(
                    '/admin/reports/' + reportId + '/evidence?audit_id=' + result.audit.id,
                  );
                  setReportReason(
                    evidence.reason +
                      (evidence.resolution ? '\n处理记录：' + evidence.resolution : ''),
                  );
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              会话用户：{pair.first_name ?? '用户 #' + pair.first_user_id} 与{' '}
              {pair.second_name ?? '用户 #' + pair.second_user_id}
              。您的本次访问需要填写原因，并记录本次行为进行留档。
            </p>
            <Field label="访问原因*">
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <button className="btn" disabled={busy}>
              记录审计并查看
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

interface AdminChat {
  id: number;
  post_id: number;
  title: string;
  post_status: string;
  owner_id: number;
  owner_name: string | null;
  created_at: string | null;
  full_at: string | null;
  dissolved_at: string | null;
  scatter_at: string | null;
  members: {
    id: number;
    name: string;
    role_name: string;
    is_owner: boolean;
    left: boolean;
  }[];
  member_count: number;
  message_count: number;
  status: string;
  retention_until: string | null;
  updated_at: string | null;
}
const chatStatusName: Record<string, string> = {
  active: '活跃',
  countdown: '遣散倒计时',
  read_only: '已遣散（只读）',
  dissolved: '已解散（只读）',
  retention: '保留期（全员已删除）',
};
/** 距自动遣散的剩余时间，格式 X天X时 / X时X分 / X分钟。 */
function countdownParts(scatterAt: string): string {
  const ms = Date.parse(scatterAt) - Date.now();
  if (!(ms > 0)) return '';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天${hours}时`;
  if (hours > 0) return `${hours}时${minutes}分`;
  return `${minutes}分钟`;
}
interface ChatAudit extends Audit {
  chat_id: number;
  admin_name?: string;
  chat_title?: string | null;
}
export function GroupChatAdmin() {
  const [params] = useSearchParams(),
    [q, setQ] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0);
  const data = useData<AdminChat[]>(
    '/admin/chats?' + new URLSearchParams({ q: query, limit: '50', offset: String(page * 50) }),
  );
  const [selected, setSelected] = useState<AdminChat>(),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [audit, setAudit] = useState<ChatAudit>(),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [hasMore, setHasMore] = useState(false),
    [reportReason, setReportReason] = useState('');
  const [dissolveTarget, setDissolveTarget] = useState<AdminChat>(),
    [dissolveBusy, setDissolveBusy] = useState(false),
    [dissolveError, setDissolveError] = useState('');
  const [auditedChat, setAuditedChat] = useState<AdminChat>();
  const { toast } = useSession();
  const audits = useData<ChatAudit[]>('/admin/chat-audits?limit=20&offset=0');
  useEffect(() => {
    const chatId = Number(params.get('chat'));
    if (!chatId) return;
    const row = data.data?.find((c) => c.id === chatId);
    if (row) {
      setSelected(row);
      setReason('');
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, data.data]);
  useEffect(() => {
    if (!audit) return;
    const timer = setTimeout(
      () => {
        setAudit(undefined);
        setMessages([]);
        setReportReason('');
        setError('访问授权已失效，请重新填写原因');
      },
      Math.max(0, Date.parse(audit.expires_at) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [audit]);
  async function loadEvidence(chatId: number, auditId: number) {
    const reportId = Number(params.get('report'));
    if (!reportId) return;
    try {
      const evidence = await api<{ reason: string; resolution: string }>(
        '/admin/reports/' + reportId + '/evidence?audit_id=' + auditId,
      );
      setReportReason(
        evidence.reason + (evidence.resolution ? '\n处理记录：' + evidence.resolution : ''),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Header
        title="群聊管理"
        sub="查看全部组队群聊的状态；群聊在第一位成员通过招募后创立，在招募结束后满员，并临时维持7天后自动解散。若所有成员进行了群聊删除，该群聊仍可审计查看，7 天后彻底清除记录。"
      />
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
          setPage(0);
        }}
      >
        <input aria-label="群聊招募标题" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">搜索群聊</button>
      </form>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      {data.data?.map((c) => {
        const activeMembers = c.members.filter((m) => !m.left);
        const countdown = c.scatter_at && !c.dissolved_at ? countdownParts(c.scatter_at) : '';
        return (
          <div className="row" key={c.id}>
            <div className="grow">
              <h3>
                由 {c.owner_name ?? '用户 #' + c.owner_id} 发起的 “{c.title}”
              </h3>
              <p>发布者：{c.owner_name ?? '用户 #' + c.owner_id}</p>
              <p>成员：{activeMembers.map((m) => m.name).join('、') || '--'}</p>
              <p>
                {c.message_count} 条消息
                {c.updated_at ? ' · 最近消息 ' + date(c.updated_at) : ''}
              </p>
              <p>创立时间：{c.created_at ? date(c.created_at) : '--'}</p>
              <p>满员时间：{c.full_at ? date(c.full_at) : '--'}</p>
              <p>
                解散时间：
                {c.dissolved_at
                  ? date(c.dissolved_at)
                  : countdown
                    ? `--（自动解散倒计时${countdown}）`
                    : '--'}
              </p>
              {c.status !== 'countdown' && <Badge>{chatStatusName[c.status] ?? c.status}</Badge>}
              {c.retention_until && <p>保留期截止：{date(c.retention_until)}</p>}
            </div>
            <button
              className="btn secondary"
              onClick={() => {
                setSelected(c);
                setReason('');
                setError('');
              }}
            >
              聊天内容审核
            </button>
          </div>
        );
      })}
      <Pager page={page} setPage={setPage} count={data.data?.length} />
      <ErrorNote error={error} />
      {audit && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>
            已授权群聊：由 {auditedChat?.owner_name ?? '用户 #' + audit.chat_id} 发起的“
            {auditedChat?.title ?? ''}”
          </h2>
          <p>
            访问审计 #{audit.id} · {audit.reason} · {date(audit.created_at)}
          </p>
          <div className="actions" style={{ display: 'flex', gap: 12 }}>
            <button
              className="link"
              onClick={() => {
                setAudit(undefined);
                setMessages([]);
                setReportReason('');
                setAuditedChat(undefined);
              }}
            >
              关闭正文
            </button>
            {auditedChat && auditedChat.status !== 'dissolved' && (
              <button
                className="link"
                style={{ color: '#b3261e' }}
                onClick={() => {
                  setDissolveError('');
                  setDissolveTarget(auditedChat);
                }}
              >
                强制解散群聊
              </button>
            )}
          </div>
          {reportReason && <p className="bodycopy">举报说明：{reportReason}</p>}
          {messages.map((m) => (
            <div className="role" key={m.id}>
              <p>
                消息 #{m.id} · {m.sender_name}（#{m.sender_id}） · {date(m.created_at)}
              </p>
              <div className="bodycopy">
                <MessageBody body={m.body} />
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const rows = await api<ChatMessage[]>(
                    '/admin/chats/access/' +
                      audit.id +
                      '?after=' +
                      messages[messages.length - 1].id,
                  );
                  setMessages((prev) => [...prev, ...rows]);
                  setHasMore(rows.length === 200);
                } catch (e) {
                  setError((e as Error).message);
                  setAudit(undefined);
                  setMessages([]);
                } finally {
                  setBusy(false);
                }
              }}
            >
              加载后续消息
            </button>
          )}
        </div>
      )}
      {selected && (
        <Modal title="群聊访问原因" onClose={() => !busy && setSelected(undefined)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setAudit(undefined);
              setMessages([]);
              setReportReason('');
              try {
                const result = await write<{ audit: ChatAudit; messages: ChatMessage[] }>(
                  '/admin/chats/' + selected.id + '/access',
                  'POST',
                  { reason },
                );
                setAudit(result.audit);
                setMessages(result.messages);
                setHasMore(result.messages.length === 200);
                setAuditedChat(selected);
                setSelected(undefined);
                void loadEvidence(selected.id, result.audit.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              由 {selected.owner_name ?? '用户 #' + selected.owner_id} 发起的“{selected.title}”
              。您的本次访问需要填写原因，并记录本次行为进行留档。
            </p>
            <Field label="访问原因*">
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <button className="btn" disabled={busy}>
              记录审计并查看
            </button>
          </form>
        </Modal>
      )}
      {dissolveTarget && (
        <Modal title="强制解散群聊" onClose={() => !dissolveBusy && setDissolveTarget(undefined)}>
          <p style={{ margin: '18px 0' }}>
            将强制解散“{dissolveTarget.title}”：群聊立即转为只读，所有成员将收到通知。此操作不可撤销。
          </p>
          <ErrorNote error={dissolveError} />
          <button
            className="btn danger"
            disabled={dissolveBusy}
            onClick={async () => {
              setDissolveBusy(true);
              setDissolveError('');
              try {
                await write('/admin/chats/' + dissolveTarget.id + '/dissolve', 'POST', {});
                setDissolveTarget(undefined);
                setAudit(undefined);
                setMessages([]);
                setReportReason('');
                setAuditedChat(undefined);
                data.refresh();
                toast('群聊已强制解散');
              } catch (e) {
                setDissolveError((e as Error).message);
              } finally {
                setDissolveBusy(false);
              }
            }}
          >
            确认强制解散
          </button>
        </Modal>
      )}
      <h2 style={{ marginTop: 28 }}>最近的群聊访问审计</h2>
      <LoadState {...audits} retry={audits.refresh} />
      {audits.data?.length === 0 && <Empty />}
      {audits.data?.map((a) => (
        <div className="row" key={a.id}>
          <div className="grow">
            <h3>
              审计 #{a.id} · 群聊 #{a.chat_id} {a.chat_title ? `（${a.chat_title}）` : ''}
            </h3>
            <p>
              管理员 {a.admin_name} · {a.reason} · {date(a.created_at)}
            </p>
          </div>
        </div>
      ))}
    </>
  );
}

interface Action {
  id: number;
  target_type: string;
  target_id: number;
  admin_id: number;
  action: string;
  reason: string;
  created_at: string;
}
export function ActionHistory({ access = false }: { access?: boolean }) {
  const [page, setPage] = useState(0),
    data = useData<(Action & Audit)[]>(
      (access ? '/admin/message-audits' : '/admin/actions') + '?limit=50&offset=' + page * 50,
    );
  return (
    <>
      <Header title={access ? '私信访问审计' : '处罚历史'} sub="记录按时间保留，管理员可查看。" />
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty />}
      {data.data?.map((a, i) => (
        <div className="panel" key={i}>
          <h3>
            {access
              ? '访问会话 #' + a.first_user_id + ' ↔ #' + a.second_user_id
              : a.target_type + ' #' + a.target_id + ' · ' + a.action}
          </h3>
          <p>
            管理员 #{a.admin_id} {a.admin_name} · {date(a.created_at)}
          </p>
          <div className="bodycopy">{a.reason}</div>
        </div>
      ))}
      <Pager page={page} setPage={setPage} count={data.data?.length} />
    </>
  );
}
