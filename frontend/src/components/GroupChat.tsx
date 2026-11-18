import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, useData, write, MESSAGE_POLL_MS, refreshInbox } from '../api';
import { useSession } from '../context';
import type { ChatInfo, ChatMessage } from '../types';
import { Avatar, ErrorNote, LoadState, Modal, date } from './ui';
import { MessageBody } from '../pages/Messages';
import { MessageDotMenu } from './MessageDotMenu';

/** 满员（招募结束）后距自动遣散的剩余时间，格式 XdXh / XhXm。 */
function countdownText(scatterAt: string, nowMs: number): string | null {
  const ms = Date.parse(scatterAt) - nowMs;
  if (!(ms > 0)) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}天${hours}时`;
  if (hours > 0) return `${hours}时${minutes}分`;
  return `${minutes}分钟`;
}

export function GroupChatView({ chatId, onClose }: { chatId: number; onClose: () => void }) {
  const { user, toast } = useSession();
  const info = useData<ChatInfo>(chatId ? '/chats/' + chatId + '/info' : null, MESSAGE_POLL_MS, true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const loadMessages = useRef<(reset?: boolean) => Promise<void>>(async () => {});
  const [confirm, setConfirm] = useState<'delete' | 'dissolve' | 'message'>();
  const [confirmMessage, setConfirmMessage] = useState<ChatMessage>();
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  // 侧栏：closed 关闭 / open 展开 / closing 向右划回动画中
  const [drawer, setDrawer] = useState<'closed' | 'open' | 'closing'>('closed');
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    const tick = () => {
      const scatterAt = info.data?.scatter_at;
      setCountdown(scatterAt ? countdownText(scatterAt, Date.now()) ?? '' : '');
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [info.data?.scatter_at]);

  useLayoutEffect(() => {
    const container = chatBodyRef.current;
    if (container && followLatest.current && !loading) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    let active = true;
    let cursor = 0;
    let inFlight: Promise<void> | undefined;
    followLatest.current = true;
    setMessages([]);
    setLoading(true);
    async function load(reset = false): Promise<void> {
      if (!active) return;
      if (inFlight) {
        await inFlight;
        if (active) await load(reset);
        return;
      }
      inFlight = (async () => {
        try {
          let nextCursor = reset ? 0 : cursor;
          const received: ChatMessage[] = [];
          let rows: ChatMessage[];
          do {
            rows = await api<ChatMessage[]>('/chats/' + chatId + '/messages?after=' + nextCursor);
            if (!active) return;
            received.push(...rows);
            if (rows.length) nextCursor = rows[rows.length - 1].id;
          } while (rows.length === 200);
          cursor = nextCursor;
          if (reset || received.length) {
            setMessages((previous) => (reset ? received : [...previous, ...received]));
          }
          await write('/chats/' + chatId + '/read');
          if (!active) return;
          setError('');
          if (reset || received.length) refreshInbox();
        } catch (e) {
          if (active) setError((e as Error).message);
        } finally {
          if (active) setLoading(false);
        }
      })();
      await inFlight;
      inFlight = undefined;
    }
    loadMessages.current = load;
    void load(true);
    const timer = setInterval(() => {
      if (!inFlight) void load();
    }, MESSAGE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
      loadMessages.current = async () => {};
    };
  }, [chatId]);

  async function send() {
    const data = info.data;
    if (!data?.can_send || busy || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await write('/chats/' + chatId, 'POST', { body });
      setBody('');
      followLatest.current = true;
      await loadMessages.current();
      refreshInbox();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof Error && /遣散|禁言|暂停/.test(e.message)) info.refresh();
    } finally {
      setBusy(false);
    }
  }

  function requestDelete() {
    setActionError('');
    if (!info.data) return;
    if (!info.data.can_delete) {
      toast('由于该群聊对应招募还未结束，无法删除');
      return;
    }
    setConfirm('delete');
  }

  async function deleteMessage(message: ChatMessage) {
    setActionError('');
    setConfirmMessage(message);
  }

  function restrictionNotice(data: ChatInfo): string {
    if (data.dissolved) return `群聊已由${data.dissolved_by_name ?? '发布者'}解散，转为只读。`;
    if (data.read_only) return '群聊已遣散，转为只读。';
    if (data.muted) return '你在当前群聊中被禁言，暂不能发言。';
    if (data.post_status === 'ended') return '招募已结束，群聊将在遣散倒计时后转为只读。';
    return '';
  }

  const data = info.data;
  const activeMembers = data?.members.filter((m) => !m.left) ?? [];
  const showCountdown = Boolean(
    data && data.scatter_at && !data.dissolved && !data.read_only && countdown,
  );
  const drawerVisible = drawer !== 'closed';
  function closeDrawer() {
    setDrawer('closing');
    setTimeout(() => setDrawer('closed'), 220);
  }

  return (
    <>
      <div className="chathead between">
        <h3>{data ? data.title : '群聊'}</h3>
        <div className="actions">
          {showCountdown && (
            <span className="chat-countdown" title="招募结束满 7 天后群聊自动解散转为只读">
              ⏳ {countdown}后自动解散
            </span>
          )}
          {data && (
            <span className="conversation-unread" aria-label={'群聊成员数'}>
              {activeMembers.length} 人
            </span>
          )}
          <button className="link" onClick={onClose}>
            关闭会话
          </button>
          <button
            className="msg-dot-btn head-dots"
            aria-label="群聊信息与操作"
            aria-expanded={drawerVisible}
            onClick={() => setDrawer('open')}
          >
            ⋯
          </button>
        </div>
      </div>
      <ErrorNote error={info.error} />
      {data?.dissolved && <div className="notice warn chat-restriction">{restrictionNotice(data)}</div>}
      {data && !data.dissolved && data.read_only && (
        <div className="notice warn chat-restriction">{restrictionNotice(data)}</div>
      )}
      {data && data.muted && !data.read_only && !data.dissolved && (
        <div className="notice warn chat-restriction">{restrictionNotice(data)}</div>
      )}
      <div
        className="chat-body"
        aria-label="群聊记录"
        ref={chatBodyRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          followLatest.current =
            container.scrollHeight - container.scrollTop - container.clientHeight < 80;
        }}
      >
        <LoadState loading={loading} />
        {messages.map((m) => {
          const isOwn = m.sender_id === user!.id;
          return (
            <article key={m.id} className={'chat-message' + (isOwn ? ' own' : '')}>
              <time dateTime={m.created_at}>{date(m.created_at)}</time>
              <div className="chat-message-content">
                <Avatar name={m.sender_name} />
                <div className="message">
                  <b style={{ display: 'block', fontSize: '0.85em', opacity: 0.75 }}>
                    {m.sender_name}
                    {data && m.sender_id === data.owner.id ? '（群主）' : ''}
                  </b>
                  <MessageBody body={m.body} />
                </div>
                {user!.verified && !user!.banned && (
                  <MessageDotMenu
                    targetId={m.id}
                    reportType={isOwn ? undefined : 'chat_message'}
                    onDelete={() => void deleteMessage(m)}
                  />
                )}
              </div>
            </article>
          );
        })}
        {data && !loading && !messages.length && !error && (
          <div className="chat-placeholder">
            <h2>还没有消息</h2>
            <p>发送一条消息，开始群聊吧</p>
          </div>
        )}
      </div>
      <ErrorNote error={error} />
      {error && (
        <button className="link" onClick={() => void loadMessages.current(true)}>
          刷新会话
        </button>
      )}
      {data && user!.verified && !user!.banned && (
        <form
          className="composer"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="群聊内容"
            required
            maxLength={4000}
            placeholder={data.can_send ? '输入文字，或粘贴链接…' : '群聊当前转为只读'}
            value={body}
            disabled={busy || !data.can_send}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="composer-footer">
            <span className="composer-hint">Enter 发送，Shift + Enter 换行</span>
            <button className="btn composer-send" disabled={busy || !data.can_send}>
              <span aria-hidden="true">➤</span> 发送
            </button>
          </div>
        </form>
      )}
      {drawerVisible && data && (
        <div className="chat-drawer-mask" onClick={() => drawer === 'open' && closeDrawer()}>
          <aside
            className={'chat-drawer' + (drawer === 'closing' ? ' closing' : '')}
            role="dialog"
            aria-label="群聊信息与操作"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chat-drawer-head">
              <h3>群聊信息</h3>
              <button
                className="chat-drawer-close"
                aria-label="关闭侧栏"
                title="关闭侧栏"
                onClick={closeDrawer}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            </div>
            <div className="chat-drawer-body">
              <p className="drawer-meta">
                创立时间：{data.created_at ? date(data.created_at) : '--'}
              </p>
              <p className="drawer-meta">
                {data.full_at ? '满员时间：' + date(data.full_at) : '满员时间：--（招募尚未结束）'}
              </p>
              {data.full_at && !data.dissolved && countdown && (
                <p className="drawer-meta">自动解散倒计时：{countdown}</p>
              )}
              <h4>群聊成员（{activeMembers.length}）</h4>
              <ul className="chat-drawer-members">
                {activeMembers.map((m) => (
                  <li key={m.id}>
                    <Avatar name={m.name} url={m.avatar_url} />
                    <div className="grow">
                      <b>{m.name}</b>
                      <span className={'member-role' + (m.is_owner ? ' owner' : '')}>
                        {m.is_owner ? '群主' : m.role_name || '成员'}
                      </span>
                    </div>
                    {m.muted && <span className="member-muted">已禁言</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="chat-drawer-actions">
              {data.is_owner && !data.dissolved && !data.read_only && (
                <button
                  className="btn secondary"
                  onClick={() => {
                    setActionError('');
                    setConfirm('dissolve');
                  }}
                >
                  解散群聊
                </button>
              )}
              {!data.is_owner && (
                <button className="btn danger" onClick={requestDelete}>
                  删除群聊
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
      {confirm && (
        <Modal
          title={
            confirm === 'delete'
              ? '删除群聊'
              : confirm === 'dissolve'
                ? '解散群聊'
                : '删除消息'
          }
          onClose={() => !actionBusy && setConfirm(undefined)}
        >
          <p style={{ margin: '18px 0' }}>
            {confirm === 'delete'
              ? '删除后该群聊将从你的消息中心移除。当所有成员都删除后，群聊记录将在服务器保留 7 天供管理员核查，之后彻底清除。'
              : confirm === 'dissolve'
                ? '解散后群聊立即转为只读，并从你的消息中心移除（对发布者等效于删除）；其他成员将收到通知，可各自删除该群聊。'
                : '确定要删除这条消息吗？删除后仅你不再可见，其他成员与群聊记录不受影响。'}
          </p>
          <ErrorNote error={actionError} />
          <button
            className="btn danger"
            disabled={actionBusy}
            onClick={async () => {
              setActionBusy(true);
              try {
                if (confirm === 'delete') {
                  await write('/chats/' + chatId, 'DELETE');
                  onClose();
                } else if (confirm === 'dissolve') {
                  await write('/chats/' + chatId + '/dissolve');
                  info.refresh();
                } else if (confirmMessage) {
                  await write('/chats/' + chatId + '/messages/' + confirmMessage.id, 'DELETE');
                  await loadMessages.current();
                  setConfirmMessage(undefined);
                }
                setConfirm(undefined);
                refreshInbox();
                toast(
                  confirm === 'delete'
                    ? '群聊已删除'
                    : confirm === 'dissolve'
                      ? '群聊已解散'
                      : '消息已删除',
                );
              } catch (e) {
                setActionError((e as Error).message);
              } finally {
                setActionBusy(false);
              }
            }}
          >
            确认{confirm === 'delete' ? '删除' : confirm === 'dissolve' ? '解散' : '删除消息'}
          </button>
        </Modal>
      )}
    </>
  );
}
