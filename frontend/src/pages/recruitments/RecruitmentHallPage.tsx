import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRecruitments } from '../../hooks/useRecruitments'
import RecruitmentCard from '../../components/domain/RecruitmentCard'
import { useAuthStore } from '../../stores/auth'

export default function RecruitmentHallPage() {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState('latest')
  const [page, setPage] = useState(1)
  const user = useAuthStore((s) => s.user)

  const { data, isLoading, isError } = useRecruitments({
    q: q || undefined,
    tag: tag || undefined,
    sort,
    page,
    page_size: 12,
  })

  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 12
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="hall-page">
      <header className="hall-topbar">
        <div className="hall-topbar-inner">
          <Link to="/" className="logo">
            CampusCrew
          </Link>
          <div className="hall-topbar-actions">
            {user ? (
              <Link to="/app/me" className="hall-auth-user" title="个人中心">
                <span className="avatar-btn">{user.nickname?.[0] ?? '我'}</span>
                <span className="hall-auth-nickname">{user.nickname}</span>
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-sm">
                  登录
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <header className="hall-header">
        <div className="hall-header-inner">
          <div>
            <h1 className="hall-title">CampusCrew 招募大厅</h1>
            <p className="hall-subtitle">找队友、组项目，一起把想法落地</p>
          </div>
          <div className="hall-filters">
            <input
              className="text-input"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder="搜索关键词"
            />
            <input
              className="text-input"
              value={tag}
              onChange={(e) => {
                setTag(e.target.value)
                setPage(1)
              }}
              placeholder="按标签筛选"
            />
            <select
              className="text-input"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                setPage(1)
              }}
            >
              <option value="latest">最新发布</option>
              <option value="deadline">截止最近</option>
            </select>
          </div>
        </div>
      </header>

      <main className="hall-main">
        {isLoading && <div className="empty-state">加载中…</div>}
        {isError && <div className="empty-state">加载失败，请稍后重试</div>}
        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <div className="empty-state">暂无招募</div>
        )}
        <div className="recruitment-grid">
          {data?.items.map((item) => (
            <RecruitmentCard key={item.id} item={item} />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              className="btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
