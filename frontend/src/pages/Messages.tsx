import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, useData, write, MESSAGE_POLL_MS, refreshInbox } from '../api';
import { useSession } from '../context';
import type { Message, Notice, Person, Post, ChatSummary } from '../types';
import { BlockButton } from '../components/SafetyActions';
import { Avatar, Header, Empty, LoadState, ErrorNote, Modal, date } from '../components/ui';
import { GroupChatView } from '../components/GroupChat';
import { MessageDotMenu } from '../components/MessageDotMenu';
import { MessageBody } from '../components/MessageBody';

function NoticeLink({ notice, onRead }: { notice: Notice; onRead: () => void }) {
  const path = notice.target_path || (notice.post_id ? '/detail/' + notice.post_id : '/settings');
  return path.startsWith('/') && !path.startsWith('//') ? (
    <Link className="link" to={path} onClick={onRead}>
      查看相关记录
    </Link>
  ) : null;
}

function Notices() {
  const [page, setPage] = useState(0);
  const data = useData<Notice[]>('/notices?limit=50&offset=' + page * 50, MESSAGE_POLL_MS);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const { toast } = useSession();
  const hasUnread = !!data.data?.some((n) => !n.is_read);
  async function mark(id: number) {
    setBusy(true);
    try {
      await write('/notices/' + id + '/read');
      data.refresh();
      refreshInbox();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function markAll() {
    setBusy(true);
    try {
      await write('/notices/read');
      setConfirmAll(false);
      data.refresh();
      refreshInbox();
      toast('已全部标为已读');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="chathead between">
        <h3>系统通知</h3>
        {hasUnread && (
          <div className="actions">
            <button className="link" disabled={busy} onClick={() => setConfirmAll(true)}>
              一键已读
            </button>
          </div>
        )}
      </div>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty title="暂无通知" />}
      {confirmAll && (
        <Modal title="一键已读" onClose={() => !busy && setConfirmAll(false)}>
          <p style={{ margin: '18px 0' }}>
            将把你的全部系统通知标为已读，此操作不可撤销。确认继续吗？
          </p>
          <button className="btn danger" disabled={busy} onClick={() => void markAll()}>
            确认全部已读
          </button>
        </Modal>
      )}
      <div className="notice-list">
        {data.data?.map((n) => (
          <div className="row" key={n.id}>
            <div className="grow">
              <h3>
                {!n.is_read && <span className="num">新</span>} {n.body}
              </h3>
              <p>{date(n.created_at)}</p>
            </div>
            <div className="actions">
              <NoticeLink notice={n} onRead={() => void mark(n.id)} />
              {!n.is_read && (
                <button className="link" disabled={busy} onClick={() => void mark(n.id)}>
                  标为已读
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {(page > 0 || (data.data?.length ?? 0) >= 50) && (
        <div className="actions notice-pagination">
          <button
            className="btn secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span>第 {page + 1} 页</span>
          <button
            className="btn secondary"
            disabled={!data.data || data.data.length < 50}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </>
  );
}

export { MessageBody } from '../components/MessageBody';
interface Conversation {
  peer: Person;
  unread_count: number;
}
interface ConversationInfo extends Person {
  blocked_by_me: boolean;
  can_message: boolean;
}

export function Chats() {
  const [params, setParams] = useSearchParams();
  const showNotices = params.get('view') === 'notices';
  const peerId = showNotices ? 0 : Number(params.get('peer')) || 0;
  const chatId = showNotices ? 0 : Number(params.get('chat')) || 0;
  const shareId = Number(params.get('share')) || 0;
  const { user, toast, openedPeers, setOpenedPeers } = useSession();
  const conversations = useData<Conversation[]>('/conversations', MESSAGE_POLL_MS, true);
  const groups = useData<ChatSummary[]>('/chats', MESSAGE_POLL_MS, true);
  const unread = useData<{ messages: number; notices: number; chats: number }>(
    '/unread',
    MESSAGE_POLL_MS,
    true,
  );
  useEffect(() => {
    const listener = () => unread.refresh();
    window.addEventListener('inbox-changed', listener);
    return () => window.removeEventListener('inbox-changed', listener);
  }, [unread.refresh]);
  const peer = useData<ConversationInfo>(
    peerId ? '/conversations/' + peerId : null,
    MESSAGE_POLL_MS,
    true,
  );
  const selectedPeer = peer.data?.id === peerId ? peer.data : undefined;
  const savedConversation = conversations.data?.find((c) => c.peer.id === peerId);
  useEffect(() => {
    if (!selectedPeer || selectedPeer.id === user?.id || savedConversation) return;
    setOpenedPeers((previous) =>
      previous.some((person) => person.id === selectedPeer.id)
        ? previous
        : [...previous, selectedPeer],
    );
  }, [selectedPeer, savedConversation, setOpenedPeers, user?.id]);
  const canMessage = selectedPeer?.can_message === true;
  const draftPeers = openedPeers.filter(
    (person) => !conversations.data?.some((conversation) => conversation.peer.id === person.id),
  );
  const share = useData<Post>(canMessage && shareId ? '/posts/' + shareId : null);
  const myPosts = useData<Post[]>(canMessage ? '/me/posts' : null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [composerMenu, setComposerMenu] = useState<'share' | 'emoji'>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const loadMessages = useRef<(reset?: boolean) => Promise<void>>(async () => {});
  const [confirm, setConfirm] = useState<{
    title: string;
    message?: string;
    path: string;
    method: string;
  }>();
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const drafts = useRef<Record<string, string>>({});
  const requests = useRef<Record<string, { body: string; id: string }>>({});
  const draftKey = user!.id + ':' + peerId;
  const currentKey = useRef(draftKey);
  currentKey.current = draftKey;
  useEffect(() => {
    setBody(drafts.current[draftKey] ?? '');
    setError('');
    setComposerMenu(undefined);
  }, [draftKey]);
  function editBody(value: string) {
    drafts.current[draftKey] = value;
    setBody(value);
  }
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
    setLoading(!!peerId);
    if (!peerId) return;
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
          const received: Message[] = [];
          let rows: Message[];
          do {
            rows = await api<Message[]>('/messages/' + peerId + '?after=' + nextCursor);
            if (!active) return;
            received.push(...rows);
            if (rows.length) nextCursor = rows[rows.length - 1].id;
          } while (rows.length === 200);
          cursor = nextCursor;
          if (reset || received.length) {
            setMessages((previous) => (reset ? received : [...previous, ...received]));
          }
          await write('/messages/' + peerId + '/read', 'POST', { through_id: cursor });
          if (!active) return;
          setError('');
          if (reset || received.length) {
            conversations.refresh();
            refreshInbox();
          }
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
  }, [peerId, user!.id, conversations.refresh]);
  function insertText(text: string) {
    if (busy || !canMessage) return;
    const input = inputRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    const nextBody = body.slice(0, start) + text + body.slice(end);
    if (nextBody.length > 4000) {
      toast('消息最多 4000 字，请缩短后再插入');
      return;
    }
    editBody(nextBody);
    setComposerMenu(undefined);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  }
  async function send() {
    if (!canMessage || busy || !body.trim()) return;
    const key = draftKey,
      text = body;
    if (!requests.current[key] || requests.current[key].body !== text) {
      const requestBytes = crypto.getRandomValues(new Uint8Array(16));
      const requestId = Array.from(requestBytes, (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      );
      requests.current[key] = { body: text, id: requestId };
    }
    setBusy(true);
    setError('');
    try {
      await write('/messages/' + peerId, 'POST', {
        body: text,
        client_id: requests.current[key].id,
      });
      delete requests.current[key];
      drafts.current[key] = '';
      if (currentKey.current === key) {
        setBody('');
        followLatest.current = true;
        void loadMessages.current().then(() => {
          if (currentKey.current === key && followLatest.current && chatBodyRef.current) {
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
          }
        });
      }
      conversations.refresh();
      refreshInbox();
    } catch (e) {
      if (currentKey.current === key) {
        setError((e as Error).message);
        if (e instanceof ApiError && e.status === 403) peer.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title="消息中心" />
      <LoadState {...conversations} retry={conversations.refresh} />
      <div
        className={
          'panel chat ' +
          (showNotices ? 'notice-view' : peerId || chatId ? 'mobile-thread' : 'mobile-list')
        }
      >
        <aside className="conversations" aria-labelledby="conversation-list-title">
          <h2 id="conversation-list-title" className="conversation-list-title">
            最近联系
          </h2>
          <Link
            className={'row pinned' + (showNotices ? ' active' : '')}
            to="/chats?view=notices"
            aria-current={showNotices ? 'page' : undefined}
          >
            <span className="avatar" aria-hidden="true">
              通
            </span>
            <div className="grow">
              <h3>系统通知</h3>
            </div>
            {!!unread.data?.notices && (
              <span className="conversation-unread" aria-label={unread.data.notices + ' 条未读通知'}>
                {unread.data.notices}
              </span>
            )}
          </Link>
          {conversations.data?.map((c) => (
            <Link
              className={'row' + (peerId === c.peer.id ? ' active' : '')}
              aria-current={peerId === c.peer.id ? 'page' : undefined}
              key={c.peer.id}
              to={'/chats?peer=' + c.peer.id}
            >
              <span className="avatar">{c.peer.name[0]}</span>
              <div className="grow">
                <h3>{c.peer.name}</h3>
              </div>
              {c.unread_count > 0 && (
                <span className="conversation-unread" aria-label={c.unread_count + ' 条未读消息'}>
                  {c.unread_count}
                </span>
              )}
            </Link>
          ))}
          {draftPeers.map((person) => (
            <Link
              key={person.id}
              className={'row' + (peerId === person.id ? ' active' : '')}
              to={'/chats?peer=' + person.id}
              aria-current={peerId === person.id ? 'page' : undefined}
            >
              <Avatar name={person.name} url={person.avatar_url} />
              <div className="grow">
                <h3>{person.name}</h3>
              </div>
            </Link>
          ))}
          {groups.data && groups.data.length > 0 && (
            <>
              <h2 className="conversation-list-title">组队群聊</h2>
              {groups.data.map((g) => (
                <Link
                  key={'chat-' + g.id}
                  className={'row' + (chatId === g.id ? ' active' : '')}
                  to={'/chats?chat=' + g.id}
                  aria-current={chatId === g.id ? 'page' : undefined}
                >
                  <span className="avatar" aria-hidden="true">
                    群
                  </span>
                  <div className="grow">
                    <h3>{g.title}</h3>
                  </div>
                  {g.unread_count > 0 && (
                    <span className="conversation-unread" aria-label={g.unread_count + ' 条未读群聊消息'}>
                      {g.unread_count}
                    </span>
                  )}
                </Link>
              ))}
            </>
          )}
        </aside>
        <section className="chatmain">
          {showNotices ? (
            <Notices />
          ) : chatId ? (
            <GroupChatView chatId={chatId} onClose={() => setParams({})} />
          ) : !peerId ? (
            <div className="chat-placeholder">
              <h2>暂无私信消息</h2>
              {Boolean(conversations.data?.length) && <p>从联系人列表选择一个会话</p>}
            </div>
          ) : (
            <>
              <div className="chathead between">
                <h3>{selectedPeer?.name ?? '私信'}</h3>
                <div className="actions">
                  <button className="link" onClick={() => setParams({})}>
                    关闭会话
                  </button>
                  {!user!.banned && (
                    <>
                      {savedConversation && (
                        <button
                          className="link"
                          onClick={() => {
                            setActionError('');
                            setConfirm({
                              title: '隐藏会话',
                              path: '/conversations/' + peerId + '/hide',
                              method: 'POST',
                            });
                          }}
                        >
                          隐藏会话
                        </button>
                      )}
                      <BlockButton personId={peerId} onChange={peer.refresh} />
                    </>
                  )}
                </div>
              </div>
              <ErrorNote error={peer.error} />
              {selectedPeer && !canMessage && (
                <div className="notice warn chat-restriction">当前无法向该同学发送消息。</div>
              )}
              {canMessage && shareId > 0 && (
                <div className="notice">
                  <ErrorNote error={share.error} />
                  {share.data && (
                    <>
                      <b>{share.data.title}</b>
                      <button
                        className="link"
                        onClick={() =>
                          editBody(
                            (body ? body + '\n' : '') +
                              window.location.origin +
                              window.location.pathname +
                              '#/detail/' +
                              shareId,
                          )
                        }
                      >
                        插入招募链接
                      </button>
                    </>
                  )}
                </div>
              )}
              <div
                className="chat-body"
                aria-label="私信记录"
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
                  const sender = isOwn ? user! : selectedPeer;
                  return (
                    <article key={m.id} className={'chat-message' + (isOwn ? ' own' : '')}>
                      <time dateTime={m.created_at}>{date(m.created_at)}</time>
                      <div className="chat-message-content">
                        <Avatar name={sender?.name ?? '同学'} url={sender?.avatar_url} />
                        <div className="message">
                          <MessageBody body={m.body} />
                        </div>
                        {!user!.banned && user!.verified && (
                          <MessageDotMenu
                            targetId={m.id}
                            reportType={m.sender_id !== user!.id ? 'message' : undefined}
                            onDelete={() => {
                              setActionError('');
                              setConfirm({
                                title: '删除消息',
                                message: '确定要删除这条消息吗？删除后仅你不再可见，对方不受影响。',
                                path: '/messages/' + m.id,
                                method: 'DELETE',
                              });
                            }}
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
                {selectedPeer && !loading && !messages.length && !error && (
                  <div className="chat-placeholder">
                    <div className="chat-empty-art" aria-hidden="true">
                      <span>•••</span>
                      <span>•••</span>
                    </div>
                    <h2>{canMessage ? '还没有消息' : '暂无私信消息'}</h2>
                    {canMessage && <p>发送一条消息，开始聊天吧</p>}
                  </div>
                )}
              </div>
              <ErrorNote error={error} />
              {error && (
                <button className="link" onClick={() => void loadMessages.current(true)}>
                  刷新会话
                </button>
              )}
              {selectedPeer && user!.verified && !user!.banned && (
                <form
                  className="composer"
                  aria-busy={busy}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    ref={inputRef}
                    aria-label="私信内容"
                    required
                    maxLength={4000}
                    placeholder="输入文字，或粘贴链接…"
                    value={body}
                    disabled={busy || !canMessage}
                    onChange={(e) => editBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        e.keyCode !== 229
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="composer-footer">
                    <div
                      className="composer-tools"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setComposerMenu(undefined);
                          inputRef.current?.focus();
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="composer-icon"
                        aria-label="分享招募链接"
                        aria-expanded={composerMenu === 'share'}
                        aria-controls="composer-share-menu"
                        disabled={busy || !canMessage}
                        onClick={() =>
                          setComposerMenu(composerMenu === 'share' ? undefined : 'share')
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m20.8 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="composer-icon"
                        aria-label="插入表情"
                        aria-expanded={composerMenu === 'emoji'}
                        aria-controls="composer-emoji-menu"
                        disabled={busy || !canMessage}
                        onClick={() =>
                          setComposerMenu(composerMenu === 'emoji' ? undefined : 'emoji')
                        }
                      >
                        <span aria-hidden="true">☺</span>
                      </button>
                      {composerMenu === 'share' && (
                        <div className="composer-popover" id="composer-share-menu">
                          <label htmlFor="share-post">分享我的招募</label>
                          <LoadState {...myPosts} retry={myPosts.refresh} />
                          <select
                            id="share-post"
                            aria-label="分享我的招募"
                            disabled={busy || !canMessage}
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                insertText(
                                  (body ? '\n' : '') +
                                    window.location.origin +
                                    window.location.pathname +
                                    '#/detail/' +
                                    e.target.value,
                                );
                            }}
                          >
                            <option value="">选择招募并插入链接</option>
                            {myPosts.data
                              ?.filter((p) => !p.unavailable && !p.interaction_paused)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              ))}
                          </select>
                          {myPosts.data &&
                            !myPosts.data.some((p) => !p.unavailable && !p.interaction_paused) && (
                              <p>暂无可分享的招募</p>
                            )}
                          <button
                            type="button"
                            className="link"
                            onClick={() => setComposerMenu(undefined)}
                          >
                            关闭菜单
                          </button>
                        </div>
                      )}
                      {composerMenu === 'emoji' && (
                        <div
                          className="composer-popover emoji-picker"
                          id="composer-emoji-menu"
                          aria-label="选择表情"
                        >
                          {['😀', '😊', '👍', '🎉', '🙏', '🤝', '❤️', '👋'].map((emoji) => (
                            <button
                              type="button"
                              key={emoji}
                              aria-label={'插入 ' + emoji}
                              disabled={busy || !canMessage}
                              onClick={() => insertText(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="link"
                            onClick={() => setComposerMenu(undefined)}
                          >
                            关闭菜单
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="composer-hint">Enter 发送，Shift + Enter 换行</span>
                    <button className="btn composer-send" disabled={busy || !canMessage}>
                      <span aria-hidden="true">➤</span> 发送
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
      {confirm && (
        <Modal title={confirm.title} onClose={() => !actionBusy && setConfirm(undefined)}>
          <p style={{ margin: '18px 0' }}>
            {confirm.message ??
              '本操作仅影响你的界面，对方仍可查看记录。隐藏的会话在收到新消息后重新出现。'}
          </p>
          <ErrorNote error={actionError} />
          <button
            className="btn danger"
            disabled={actionBusy}
            onClick={async () => {
              setActionBusy(true);
              try {
                await write(confirm.path, confirm.method);
                if (confirm.method === 'POST') {
                  setOpenedPeers((previous) => previous.filter((person) => person.id !== peerId));
                  setParams({});
                }
                setConfirm(undefined);
                if (confirm.method === 'DELETE') await loadMessages.current(true);
                conversations.refresh();
                refreshInbox();
                toast('操作已完成');
              } catch (e) {
                setActionError((e as Error).message);
              } finally {
                setActionBusy(false);
              }
            }}
          >
            确认{confirm.title}
          </button>
        </Modal>
      )}
    </>
  );
}
