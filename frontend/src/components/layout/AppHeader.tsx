import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth'
import { useUnread } from '../../hooks/useUnread'

export default function AppHeader() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { data: unread } = useUnread()

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="logo">
          CampusCrew
        </Link>
        <nav className="app-nav">
          <Link to="/">大厅</Link>
          <Link to="/app/recruitments/new">发布招募</Link>
          <Link to="/app/recruitments/mine">我的发布</Link>
          <Link to="/app/applications/mine">我的申请</Link>
          <Link to="/app/messages">
            消息{unread ? <span className="unread-badge">{unread}</span> : null}
          </Link>
        </nav>
        <div className="app-header-right">
          <button
            type="button"
            className="app-header-user"
            onClick={() => navigate('/app/me')}
            title={user?.nickname ?? '个人中心'}
          >
            <span className="avatar-btn">{user?.nickname?.[0] ?? '我'}</span>
            <span className="app-header-nickname">
              {user?.nickname ?? '个人中心'}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
