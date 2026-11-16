import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, useData, write, MESSAGE_POLL_MS, refreshInbox } from '../api';
import { useSession } from '../context';
import type { Message, Notice, Person, Post } from '../types';
import { BlockButton, ReportButton } from '../components/SafetyActions';
import { Avatar, Header, Empty, LoadState, ErrorNote, Modal, date } from '../components/ui';

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
  const { toast } = useSession();
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
  return (
    <>
      <div className="chathead">
        <h3>系统通知</h3>
      </div>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty title="暂无通知" />}
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

export function MessageBody({ body }: { body: string }) {
  return (
    <>
      {body.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
        if (!/^https?:\/\//.test(part)) return part;
        try {
          const url = new URL(part);
          if (url.origin === window.location.origin && url.hash.startsWith('#/detail/'))
            return (
              <Link key={index} to={url.hash.slice(1)}>
                {part}
              </Link>
            );
          return (
            <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">
              {part}
            </a>
          );
        } catch {
          return part;
        }
      })}
    </>
  );
}
interface Conversation {
  peer: Person;
}
interface ConversationInfo extends Person {
  blocked_by_me: boolean;
  can_message: boolean;
}

export function Chats() {
  const [params, setParams] = useSearchParams();
  const showNotices = params.get('view') === 'notices';
  const peerId = showNotices ? 0 : Number(params.get('peer')) || 0;
  const shareId = Number(params.get('share')) || 0;
  const { user, toast, openedPeers, setOpenedPeers } = useSession();
  const conversations = useData<Conversation[]>('/conversations', MESSAGE_POLL_MS);
  const peer = useData<ConversationInfo>(
    peerId ? '/conversations/' + peerId : null,
    MESSAGE_POLL_MS,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState<{ title: string; path: string; method: string }>();
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
  }, [draftKey]);
  function editBody(value: string) {
    drafts.current[draftKey] = value;
    setBody(value);
  }
  useEffect(() => {
    let active = true,
      fetching = false,
      cursor = 0;
    setMessages([]);
    setLoading(!!peerId);
    if (!peerId) return;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        let rows: Message[];
        do {
          rows = await api<Message[]>('/messages/' + peerId + '?after=' + cursor);
          if (!active) return;
          if (rows.length) {
            cursor = rows[rows.length - 1].id;
            setMessages((prev) => [...prev, ...rows]);
          }
        } while (rows.length === 200);
        await write('/messages/' + peerId + '/read');
        if (active) {
          setError('');
          refreshInbox();
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, MESSAGE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [peerId, user!.id, retry]);
  async function send() {
    if (!canMessage || busy || !body.trim()) return;
    const key = draftKey,
      text = body;
    if (!requests.current[key] || requests.current[key].body !== text)
      requests.current[key] = { body: text, id: crypto.randomUUID() };
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
        setRetry((n) => n + 1);
      }
      conversations.refresh();
      refreshInbox();
    } catch (e) {
      if (currentKey.current === key) setError((e as Error).message);
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
          'panel chat ' + (showNotices ? 'notice-view' : peerId ? 'mobile-thread' : 'mobile-list')
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
            <h3>系统通知</h3>
          </Link>
          {conversations.data?.map((c) => (
            <Link
              className={'row' + (peerId === c.peer.id ? ' active' : '')}
              key={c.peer.id}
              to={'/chats?peer=' + c.peer.id}
            >
              <span className="avatar">{c.peer.name[0]}</span>
              <div className="grow">
                <h3>{c.peer.name}</h3>
              </div>
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
        </aside>
        <section className="chatmain">
          {showNotices ? (
            <Notices />
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
              <div className="chat-body" aria-label="私信记录">
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
                      </div>
                      {!user!.banned && user!.verified && (
                        <div className="actions">
                          <button
                            className="link"
                            onClick={() => {
                              setActionError('');
                              setConfirm({
                                title: '删除消息',
                                path: '/messages/' + m.id,
                                method: 'DELETE',
                              });
                            }}
                          >
                            删除
                          </button>
                          {m.sender_id !== user!.id && (
                            <ReportButton type="message" targetId={m.id} />
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                {selectedPeer && !loading && !messages.length && !error && (
                  <p className="chat-placeholder">
                    {canMessage ? '还没有消息，打个招呼吧' : '暂无私信消息'}
                  </p>
                )}
              </div>
              <ErrorNote error={error} />
              {error && (
                <button className="link" onClick={() => setRetry((n) => n + 1)}>
                  刷新会话
                </button>
              )}
              {canMessage && (
                <form
                  className="composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <div className="actions composer-tools">
                    <label>
                      分享我的招募{' '}
                      <select
                        aria-label="分享我的招募"
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            editBody(
                              (body ? body + '\n' : '') +
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
                    </label>
                  </div>
                  <textarea
                    aria-label="私信内容"
                    required
                    maxLength={4000}
                    placeholder="输入文字或招募链接…"
                    value={body}
                    onChange={(e) => editBody(e.target.value)}
                  />
                  <div className="composer-footer">
                    <button className="btn" disabled={busy || !body.trim()}>
                      {busy ? '发送中…' : '发送'}
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
            本操作仅影响你的界面，对方仍可查看记录。隐藏的会话在收到新消息后重新出现。
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
                setRetry((n) => n + 1);
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
