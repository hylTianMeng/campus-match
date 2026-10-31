import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useSession } from '../context';
import { useData } from '../api';
export function Layout() {
  const { user } = useSession();
  const { pathname } = useLocation();
  const { data } = useData<{ total: number }>(user ? '/unread' : null, 10000);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/discover">
          <span className="seal">紫</span>
          <span>
            <strong>CampusCrew</strong>
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
              <Link className="avatar" to="/profile" aria-label="个人资料">
                {user.name[0]}
              </Link>
              <Link className="name" to="/profile">
                {user.name}
              </Link>
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
];
export function PersonalLayout() {
  const { user } = useSession();
  return (
    <div className="side-layout">
      <aside className="sidemenu">
        <div className="profilemini">
          <span className="avatar">{user?.name[0]}</span>
          <b>{user?.name}</b>
        </div>
        {links.map(([path, title]) => (
          <NavLink key={path} to={path}>
            {title}
          </NavLink>
        ))}
      </aside>
      <section>
        <Outlet />
      </section>
    </div>
  );
}
export function MessageTabs() {
  return (
    <div className="tabs">
      <NavLink to="/chats">私信</NavLink>
      <NavLink to="/notices">系统通知</NavLink>
    </div>
  );
}
