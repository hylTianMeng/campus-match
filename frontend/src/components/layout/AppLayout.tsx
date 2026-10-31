import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'

export default function AppLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
