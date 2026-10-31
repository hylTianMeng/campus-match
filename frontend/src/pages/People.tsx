import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../api';
import type { Person, Post } from '../types';
import { useSession } from '../context';
import { Header, Tags, LoadState, Empty, Badge } from '../components/ui';
import { PostCard } from '../components/PostCard';
export function People() {
  const [name, setName] = useState(''),
    [tag, setTag] = useState(''),
    [query, setQuery] = useState(''),
    data = useData<Person[]>('/people?' + query);
  return (
    <>
      <Header title="找到同频的同学" sub="用技能和兴趣建立连接。仅展示允许被搜索的认证用户。" />
      <div className="panel">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(new URLSearchParams({ q: name, tag }).toString());
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="搜索同学昵称"
            placeholder="输入同学昵称"
          />
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            aria-label="技能或兴趣"
            placeholder="技能 / 兴趣标签"
          />
          <button className="btn">搜索同学</button>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setName('');
              setTag('');
              setQuery('');
            }}
          >
            清空
          </button>
        </form>
      </div>
      <LoadState {...data} retry={data.refresh} />
      {data.data?.length === 0 && <Empty title="没有符合条件的同学" />}
      <div className="grid">
        {data.data?.map((p) => (
          <article className="card" key={p.id}>
            <div className="actions">
              <span className="avatar lg">{p.name[0]}</span>
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.dept} · {p.year}
                </p>
              </div>
            </div>
            <p>{p.bio}</p>
            <Tags values={p.tags} />
            <div className="actions">
              <Link className="btn secondary" to={'/person/' + p.id}>
                查看主页
              </Link>
              <Link className="link" to={'/chats?peer=' + p.id}>
                发私信
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
interface PublicProfile extends Person {
  public_posts: boolean;
  public_teams: boolean;
  posts: Post[] | null;
  teams: { post_id: number; title: string; role_name: string }[] | null;
}
export function PersonPage() {
  const { id } = useParams(),
    data = useData<PublicProfile>('/people/' + id),
    { user } = useSession(),
    [section, setSection] = useState(''),
    p = data.data;
  if (!p) return <LoadState {...data} retry={data.refresh} />;
  return (
    <>
      <Header
        title={user?.id === p.id ? '我的对外主页' : '同学主页'}
        sub="公开资料不展示校园邮箱、审核结果或申请留言。"
      />
      <div className="panel">
        <div className="actions">
          <span className="avatar lg">{p.name[0]}</span>
          <div className="grow">
            <h1>{p.name}</h1>
            <p>
              {p.dept} · {p.year}
            </p>
          </div>
          {user?.id !== p.id && (
            <Link className="btn" to={'/chats?peer=' + p.id}>
              私信联系
            </Link>
          )}
        </div>
        <p style={{ margin: '20px 0' }}>{p.bio}</p>
        <Tags values={p.tags} />
      </div>
      <div className="person-grid">
        {[
          ['posts', '发布的招募', p.public_posts],
          ['apps', '申请记录', false],
          ['teams', '组队历史', p.public_teams],
        ].map(([key, title, visible]) => (
          <div className="panel" key={String(key)}>
            <div className="between">
              <h2>{title}</h2>
              <Badge color={visible ? 'green' : 'gray'}>{visible ? '已公开' : '未公开'}</Badge>
            </div>
            <p className="small muted" style={{ margin: '12px 0 16px' }}>
              {visible ? '查看公开的合作记录。' : '对方未公开此项'}
            </p>
            {visible && (
              <button className="link" onClick={() => setSection(String(key))}>
                查看详情
              </button>
            )}
          </div>
        ))}
      </div>
      {section === 'posts' && (
        <div className="grid" style={{ marginTop: 20 }}>
          {p.posts?.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {p.posts?.length === 0 && <Empty />}
        </div>
      )}
      {section === 'teams' && (
        <div className="panel" style={{ marginTop: 20 }}>
          {p.teams?.map((t) => (
            <div className="row" key={t.post_id}>
              <Link className="link" to={'/detail/' + t.post_id}>
                {t.title} · {t.role_name}
              </Link>
            </div>
          ))}
          {p.teams?.length === 0 && <Empty />}
        </div>
      )}
    </>
  );
}
