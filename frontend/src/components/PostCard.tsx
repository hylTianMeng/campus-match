import { Link } from 'react-router-dom';
import type { Post } from '../types';
import { Tags, Badge } from './ui';
export function PostCard({ post }: { post: Post }) {
  const accepted = post.roles.reduce((n, r) => n + r.accepted, 0),
    total = post.roles.reduce((n, r) => n + r.capacity, 0);
  const days = Math.ceil((Date.parse(post.deadline) - Date.now()) / 86400000);
  return (
    <article className="card">
      <div className="between">
        <span className="eyebrow">
          {post.category} / {String(post.id).padStart(2, '0')}
        </span>
        <Badge color={post.status === 'open' ? 'green' : 'gray'}>
          {post.status === 'open' ? '招募中' : '已结束'}
        </Badge>
      </div>
      <h3>
        <Link to={'/detail/' + post.id}>{post.title}</Link>
      </h3>
      <p>{post.description.split('\n')[0]}</p>
      <Tags values={post.tags} />
      <div className="roleline">
        <span>
          {post.roles
            .slice(0, 2)
            .map((r) => r.name)
            .join(' · ')}
        </span>
        <span>
          {accepted} / {total} 已录取
        </span>
      </div>
      <div className="progress">
        <span style={{ width: `${total ? (accepted / total) * 100 : 0}%` }} />
      </div>
      <div className="small muted">
        {post.status === 'open' && days <= 7 && (
          <>
            <Badge color={days <= 1 ? 'red' : 'amber'}>不足 {Math.max(1, days)} 天截止</Badge>{' '}
            ·{' '}
          </>
        )}
        {post.place || '地点待定'}
      </div>
      <div className="cardfoot">
        <span>
          <span className="avatar">{post.owner.name[0]}</span> {post.owner.name}
        </span>
        <Link className="link" to={'/detail/' + post.id}>
          查看招募 ↗
        </Link>
      </div>
    </article>
  );
}
