import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, useData, write } from '../api';
import { useSession } from '../context';
import type { Message, Notice, Person } from '../types';
import { MessageTabs } from '../components/Layout';
import { Header, Empty, LoadState, ErrorNote, date } from '../components/ui';
export function Notices() {
  const data = useData<Notice[]>('/notices', 10000),
    [busy, setBusy] = useState(false),
    { toast } = useSession();
  return (
    <>
      <Header title="消息中心" sub="合作进展与系统通知。">
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await write('/notices/read');
              data.refresh();
            } catch (e) {
              toast((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          全部标为已读
        </button>
      </Header>
      <MessageTabs />
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty title="暂无通知" />}
      <div className="panel">
        {data.data?.map((n) => (
          <div className="row" key={n.id}>
            <div className="grow">
              <h3>
                {!n.is_read && <span className="num">新</span>} {n.body}
              </h3>
              <p>{date(n.created_at)}</p>
            </div>
            {n.post_id && (
              <Link className="link" to={'/detail/' + n.post_id}>
                查看招募
              </Link>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
interface Conversation {
  peer: Person;
  last: { body: string; created_at: string };
}
export function Chats() {
  const [params, setParams] = useSearchParams(),
    peerId = Number(params.get('peer')) || 0,
    { user } = useSession();
  const conversations = useData<Conversation[]>('/conversations', 10000),
    peer = useData<Person>(peerId ? '/people/' + peerId : null);
  const [messages, setMessages] = useState<Message[]>([]),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      fetching = false,
      cursor = 0;
    setMessages([]);
    setBody('');
    setError('');
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
        if (active) setError('');
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [peerId, retry]);
  return (
    <>
      <Header title="消息中心" sub="从一次交流开始，让合作更有默契。" />
      <MessageTabs />
      <ErrorNote error={conversations.error} />
      <div className={'panel chat ' + (peerId ? 'mobile-thread' : 'mobile-list')}>
        <aside className="conversations">
          {conversations.data?.map((c) => (
            <Link
              className={'row' + (peerId === c.peer.id ? ' active' : '')}
              key={c.peer.id}
              to={'/chats?peer=' + c.peer.id}
            >
              <span className="avatar">{c.peer.name[0]}</span>
              <div className="grow">
                <h3>{c.peer.name}</h3>
                <p>{c.last.body.slice(0, 28)}</p>
              </div>
            </Link>
          ))}
          {conversations.data?.length === 0 && (
            <Empty title="暂无会话">
              <Link className="link" to="/people">
                去找同学
              </Link>
            </Empty>
          )}
        </aside>
        <section className="chatmain">
          {!peerId ? (
            <Empty title="选择一位同学开始交流" />
          ) : (
            <>
              <div className="chathead between">
                <h3>{peer.data?.name ?? '私信'}</h3>
                <button className="link" onClick={() => setParams({})}>
                  关闭会话
                </button>
              </div>
              <ErrorNote error={peer.error} />
              <div className="bubbles chat-body" aria-label="私信记录">
                <LoadState loading={loading} />
                {messages.map((m) => (
                  <div
                    className={'bubble message' + (m.sender_id === user!.id ? ' self' : '')}
                    key={m.id}
                  >
                    {m.body}
                    <small>{date(m.created_at)}</small>
                  </div>
                ))}
                {!loading && !messages.length && !error && <Empty title="还没有消息，打个招呼吧" />}
              </div>
              <ErrorNote error={error} />
              {error && (
                <button className="link" onClick={() => setRetry((n) => n + 1)}>
                  重新加载
                </button>
              )}
              <form
                className="composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError('');
                  const text = body;
                  try {
                    await write('/messages/' + peerId, 'POST', { body: text });
                    setBody('');
                    setRetry((n) => n + 1);
                    conversations.refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <textarea
                  aria-label="私信内容"
                  required
                  maxLength={4000}
                  placeholder="输入文字消息…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="between" style={{ marginTop: 10 }}>
                  <span className="small muted">仅文字 · 无已读回执</span>
                  <button className="btn" disabled={busy || !body.trim() || peerId === user!.id}>
                    {busy ? '发送中…' : '发送'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}
