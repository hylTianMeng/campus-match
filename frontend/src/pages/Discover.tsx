import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../api';
import type { Post } from '../types';
import { PostCard } from '../components/PostCard';
import { Header, Empty, LoadState } from '../components/ui';
export function Discover() {
  const [input, setInput] = useState(''),
    [q, setQ] = useState(''),
    [category, setCategory] = useState('全部'),
    [sort, setSort] = useState('latest');
  const posts = useData<Post[]>('/posts?' + new URLSearchParams({ q, sort }));
  const categories = useData<string[]>('/categories');
  const all = posts.data ?? [],
    visible = all.filter((p) => category === '全部' || p.category === category);
  function clear() {
    setInput('');
    setQ('');
    setCategory('全部');
  }
  return (
    <>
      <Header title="发现值得同行的事" sub="从课程合作到校园实践，找到适合自己的岗位。">
        <Link className="btn" to="/publish">
          ＋ 发布招募
        </Link>
      </Header>
      <section className="searchbar">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input);
          }}
        >
          <input
            aria-label="招募关键词"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索招募标题、分类或标签"
          />
          <button className="btn">搜索招募</button>
          {(q || category !== '全部') && (
            <button type="button" className="btn ghost" onClick={clear}>
              清空搜索
            </button>
          )}
        </form>
      </section>
      <div className="cattabs">
        {['全部', ...(categories.data ?? [])].map((c) => (
          <button
            className={'chip' + (c === category ? ' active' : '')}
            key={c}
            onClick={() => setCategory(c)}
            aria-pressed={c === category}
          >
            {c}
            <span className="chip-num">
              {c === '全部' ? all.length : all.filter((p) => p.category === c).length}
            </span>
          </button>
        ))}
      </div>
      <div className="sectionline">
        <h2>
          搜索结果 <small className="muted">/ {visible.length} 条招募</small>
        </h2>
        <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="latest">最新发布</option>
          <option value="deadline">即将截止</option>
        </select>
      </div>
      <LoadState {...posts} retry={posts.refresh} />
      <LoadState loading={categories.loading} error={categories.error} retry={categories.refresh} />
      {!posts.loading && !posts.error && visible.length === 0 && (
        <Empty title="没有符合条件的招募">
          <button className="btn secondary" onClick={clear}>
            清空搜索
          </button>
        </Empty>
      )}
      {categories.data?.map((c) => {
        const items = visible.filter((p) => p.category === c);
        return items.length ? (
          <div className="catsection" key={c}>
            <div className="cathead">
              <h3>{c}</h3>
              <small className="muted">{items.length} 条</small>
            </div>
            <div className="grid">
              {items.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        ) : null;
      })}
    </>
  );
}
