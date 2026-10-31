import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { userApi } from '../../api/user'
import { useAuthStore } from '../../stores/auth'
import { BizError } from '../../types/api'

export default function MePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const clear = useAuthStore((s) => s.clear)

  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [department, setDepartment] = useState(user?.department ?? '')
  const [grade, setGrade] = useState(user?.grade ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const updated = await userApi.updateProfile({
        nickname,
        department,
        grade,
        bio,
      })
      setUser(updated)
      setMessage('已保存')
    } catch (err) {
      setError(err instanceof BizError ? err.message : '保存失败')
    }
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // 忽略登出请求失败，本地仍清除登录态
    }
    clear()
    navigate('/login')
  }

  return (
    <div className="page-container narrow-page">
      <h1 className="page-title">我的</h1>

      <div className="me-email">{user?.email}</div>

      <div className="entry-grid">
        <Link className="entry-card" to="/app/recruitments/mine">
          我的发布
        </Link>
        <Link className="entry-card" to="/app/applications/mine">
          我的申请
        </Link>
        <Link className="entry-card" to="/app/messages">
          消息
        </Link>
        <Link className="entry-card" to="/app/recruitments/new">
          发布招募
        </Link>
      </div>

      <form className="form-stack" onSubmit={save}>
        <h2 className="section-title">资料编辑</h2>
        <label className="field">
          <span>昵称</span>
          <input
            className="text-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>院系</span>
          <input
            className="text-input"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </label>
        <label className="field">
          <span>年级</span>
          <input
            className="text-input"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
        </label>
        <label className="field">
          <span>简介</span>
          <textarea
            className="text-input"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
          />
        </label>
        {error && <div className="error-text">{error}</div>}
        {message && <div className="success-text">{message}</div>}
        <button className="btn btn-primary" type="submit">
          保存资料
        </button>
      </form>

      <button className="btn btn-ghost logout-btn" onClick={logout}>
        退出登录
      </button>
    </div>
  )
}
