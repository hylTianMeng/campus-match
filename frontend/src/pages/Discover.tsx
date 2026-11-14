import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../api';
import type { Post } from '../types';
import { PostCard } from '../components/PostCard';
import { Header, Empty, LoadState } from '../components/ui';
export function Discover() {
  const [input, setInput] = useState(''),
    [q, setQ] = useState(''),
    [tagInput, setTagInput] = useState(''),
    [tag, setTag] = useState(''),
    [category, setCategory] = useState('全部'),
    [sort, setSort] = useState('latest');
  const posts = useData<Post[]>('/posts?' + new URLSearchParams({
    q, tag, sort, category: category === '全部' ? '' : category,
  }));
  const categories = useData<string[]>('/categories');
  const availableTags = useData<string[]>('/post-tags');
  const visible = posts.data ?? [];
  const searching = Boolean(q || tag);
  function clear() {
    setInput('');
    setQ('');
    setTagInput('');
    setTag('');
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
            setQ(input.trim());
            setTag(tagInput.trim());
          }}
        >
          <input
            aria-label="招募关键词"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="搜索标签、标题、分类或说明"
          />
          <input
            aria-label="招募标签"
            list="post-tag-options"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="查找小标签"
          />
          <datalist id="post-tag-options">
            {availableTags.data?.map((value) => <option key={value} value={value} />)}
          </datalist>
          <button className="btn">搜索招募</button>
          {(q || tag || category !== '全部') && (
            <button type="button" className="btn ghost" onClick={clear}>
              清空搜索
            </button>
          )}
        </form>
        {!!availableTags.data?.length && (
          <div className="tag-filter" aria-label="可查找的小标签">
            <span className="small muted">小标签</span>
            {availableTags.data.slice(0, 12).map((value) => (
              <button
                type="button"
                className={'tag tag-button' + (tag === value ? ' active' : '')}
                aria-pressed={tag === value}
                key={value}
                onClick={() => {
                  const next = tag === value ? '' : value;
                  setTag(next);
                  setTagInput(next);
                }}
              >
                {value}
              </button>
            ))}
          </div>
        )}
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
      {searching ? (
        <div className="grid">
          {visible.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      ) : categories.data?.map((c) => {
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
