import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

interface Props {
  children: ReactNode
  requireVerified?: boolean
}

export default function ProtectedRoute({ children, requireVerified = false }: Props) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  if (requireVerified && user && !user.is_verified) {
    return (
      <div className="page-container">
        <div className="notice-box">未完成校园认证，无法访问此功能</div>
      </div>
    )
  }

  return <>{children}</>
}
