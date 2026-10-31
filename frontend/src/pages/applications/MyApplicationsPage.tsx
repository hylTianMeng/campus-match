import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { applicationApi } from '../../api/application'
import ApplicationStatusBadge from '../../components/domain/ApplicationStatusBadge'
import { useApplications } from '../../hooks/useApplications'
import { BizError } from '../../types/api'

export default function MyApplicationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const { data, isLoading } = useApplications()

  const action = useMutation({
    mutationFn: ({ aid, type }: { aid: number; type: 'withdraw' | 'abandon' }) =>
      type === 'withdraw'
        ? applicationApi.withdraw(aid)
        : applicationApi.abandon(aid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications', 'mine'] })
    },
    onError: (e) => setError(e instanceof BizError ? e.message : '操作失败'),
  })

  return (
    <div className="page-container">
      <h1 className="page-title">我的申请</h1>
      {error && <div className="error-text">{error}</div>}
      {isLoading && <div className="empty-state">加载中…</div>}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="empty-state">还没有提交过申请</div>
      )}

      <div className="list-stack">
        {data?.items.map((app) => (
          <div key={app.id} className="list-row">
            <div className="list-row-main">
              <button
                className="link-btn list-row-title"
                onClick={() => navigate(`/recruitments/${app.recruitment_id}`)}
              >
                {app.recruitment?.title ?? `招募 ${app.recruitment_id}`}
              </button>
              <div className="list-row-meta">
                <span>岗位：{app.position?.name ?? app.position_id}</span>
                <ApplicationStatusBadge status={app.status} reason={app.reason} />
                {app.message && <span className="muted">留言：{app.message}</span>}
              </div>
            </div>
            <div className="list-row-actions">
              {app.status === 'pending' && (
                <button
                  className="btn btn-sm"
                  onClick={() => action.mutate({ aid: app.id, type: 'withdraw' })}
                >
                  撤回
                </button>
              )}
              {app.status === 'accepted' && (
                <button
                  className="btn btn-sm"
                  onClick={() => action.mutate({ aid: app.id, type: 'abandon' })}
                >
                  放弃录取
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
