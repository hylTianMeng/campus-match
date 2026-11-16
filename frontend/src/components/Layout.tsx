import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSession } from '../context';
import { useData, MESSAGE_POLL_MS } from '../api';
import { Avatar } from './ui';
export function Layout() {
  const { user, logout, toast } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data, refresh } = useData<{ total: number }>(user ? '/unread' : null, MESSAGE_POLL_MS);
  useEffect(() => {
    window.addEventListener('inbox-changed', refresh);
    return () => window.removeEventListener('inbox-changed', refresh);
  }, [refresh]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/discover', { replace: true });
    } catch (error) {
      toast(error instanceof Error ? error.message : '退出登录失败，请重试。');
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/discover">
          <img className="brand-mark" src="/tsingmate-mark.svg" alt="" />
          <span>
            <strong>
              Tsing<span>Mate</span>
            </strong>
            <small>清华大学校园组队</small>
          </span>
        </Link>
        <nav className="nav" aria-label="主导航">
          <NavLink
            className={pathname === '/discover' || pathname.startsWith('/detail') ? 'active' : ''}
            to="/discover"
          >
            发现组队
          </NavLink>
          <NavLink to="/publish">发布招募</NavLink>
          <NavLink to="/people">找同学</NavLink>
        </nav>
        <div className="account">
          {user ? (
            <>
              <Link
                className={'bell ' + (['/chats', '/notices'].includes(pathname) ? 'active' : '')}
                to="/chats"
                aria-label="消息中心"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {!!data?.total && <span className="num">{data.total}</span>}
              </Link>
              <Link to="/profile" aria-label="个人资料">
                <Avatar name={user.name} url={user.avatar_url} />
              </Link>
              <Link className="name" to="/profile">
                {user.name}
              </Link>
              <button
                type="button"
                className="btn secondary"
                disabled={loggingOut}
                onClick={handleLogout}
              >
                退出登录
              </button>
              {user.is_admin && (
                <Link className="btn secondary" to="/admin">
                  后台
                </Link>
              )}
            </>
          ) : (
            <Link className="btn secondary" to="/auth">
              登录
            </Link>
          )}
        </div>
      </header>
      <main className="wrap">
        <Outlet />
      </main>
    </>
  );
}
const links = [
  ['/profile', '个人资料'],
  ['/posts', '管理发布'],
  ['/applications', '当前申请'],
  ['/teams', '组队历史'],
  ['/favorites', '我的收藏'],
  ['/settings', '账号设置'],
  ['/blocks', '黑名单'],
  ['/reports', '我的举报'],
];
export function PersonalLayout() {
  const { user } = useSession();
  return (
    <div className="side-layout">
      <aside className="sidemenu">
        <div className="profilemini">
          <Avatar name={user?.name ?? ''} url={user?.avatar_url} />
          <b>{user?.name}</b>
        </div>
        {links.map(([path, title]) => (
          <NavLink key={path} to={path}>
            {title}
          </NavLink>
        ))}
        {user?.is_admin && <NavLink to="/admin">后台管理</NavLink>}
      </aside>
      <section>
        <Outlet />
      </section>
    </div>
  );
}
