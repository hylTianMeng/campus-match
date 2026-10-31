import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/auth'
import { BizError } from '../../types/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUser = useAuthStore((s) => s.setUser)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      setTokens(res)
      setUser(res.user)
      navigate('/')
    } catch (err) {
      setError(err instanceof BizError ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="auth-title">登录 CampusCrew</h2>
        <form onSubmit={submit} className="form-stack">
          <label className="field">
            <span>校园邮箱</span>
            <input
              className="text-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@stu.example.edu"
              required
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              required
            />
          </label>
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
        <p className="auth-switch">
          还没有账号？<Link to="/register">立即注册</Link>
        </p>
      </div>
    </div>
  )
}
