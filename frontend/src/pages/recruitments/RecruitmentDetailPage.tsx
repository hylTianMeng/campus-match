import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { applicationApi } from '../../api/application'
import { recruitmentApi } from '../../api/recruitment'
import ApplicationStatusBadge from '../../components/domain/ApplicationStatusBadge'
import PositionCard from '../../components/domain/PositionCard'
import StatusBadge from '../../components/ui/StatusBadge'
import { useRecruitment } from '../../hooks/useRecruitment'
import { useAuthStore } from '../../stores/auth'
import { BizError } from '../../types/api'

export default function RecruitmentDetailPage() {
  const { id } = useParams()
  const rid = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const { data: detail, isLoading, isError } = useRecruitment(rid)
  const isOwner = user != null && detail != null && detail.owner_id === user.id

  const applicationsQuery = useQuery({
    queryKey: ['recruitment', rid, 'applications'],
    queryFn: () => recruitmentApi.listApplications(rid, { page_size: 50 }),
    enabled: !!isOwner,
  })

  const [error, setError] = useState('')

  const applyMutation = useMutation({
    mutationFn: (pid: number) => applicationApi.submit(rid, pid, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment', rid] })
      qc.invalidateQueries({ queryKey: ['applications', 'mine'] })
    },
    onError: (e) => setError(e instanceof BizError ? e.message : '申请失败'),
  })

  const decideMutation = useMutation({
    mutationFn: ({
      aid,
      action,
    }: {
      aid: number
      action: 'approve' | 'reject' | 'revoke'
    }) => {
      if (action === 'approve') return applicationApi.approve(aid)
      if (action === 'reject') return applicationApi.reject(aid)
      return applicationApi.revoke(aid)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment', rid, 'applications'] })
      qc.invalidateQueries({ queryKey: ['recruitment', rid] })
    },
    onError: (e) => setError(e instanceof BizError ? e.message : '操作失败'),
  })

  if (isLoading) return <div className="page-container empty-state">加载中…</div>
  if (isError || !detail)
    return <div className="page-container empty-state">招募不存在或已删除</div>

  const alreadyApplied = (positionId: number) =>
    detail.my_applications.some((a) => a.position_id === positionId)

  return (
    <div className="page-container detail-page">
      <button className="btn btn-ghost" onClick={() => navigate(-1)}>
        ← 返回
      </button>

      <div className="detail-head">
        <div className="detail-title-row">
          <h1 className="detail-title">{detail.title}</h1>
          <StatusBadge status={detail.status} endReason={detail.end_reason} />
        </div>
        <div className="detail-owner">发布者：{detail.owner.nickname}</div>
        {detail.location && <div className="detail-meta">地点：{detail.location}</div>}
        {detail.activity_time && (
          <div className="detail-meta">活动时间：{detail.activity_time}</div>
        )}
        <div className="detail-deadline">
          截止时间：{dayjs(detail.deadline_at).format('YYYY-MM-DD HH:mm')}
        </div>
        {detail.tags.length > 0 && (
          <div className="detail-tags">
            {detail.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <section className="detail-section">
        <h2 className="section-title">招募说明</h2>
        <p className="detail-description">{detail.description}</p>
      </section>

      <section className="detail-section">
        <h2 className="section-title">岗位</h2>
        {error && <div className="error-text">{error}</div>}
        <div className="position-grid">
          {detail.positions.map((p) => (
            <PositionCard
              key={p.id}
              position={p}
              canApply={detail.allowed_actions.apply && p.status === 'available'}
              alreadyApplied={alreadyApplied(p.id)}
              isOwner={isOwner}
              onApply={(pid) => applyMutation.mutate(pid)}
            />
          ))}
        </div>
      </section>

      {isOwner && (
        <section className="detail-section">
          <h2 className="section-title">申请管理</h2>
          {applicationsQuery.isLoading && <div className="empty-state">加载中…</div>}
          {applicationsQuery.data && applicationsQuery.data.items.length === 0 && (
            <div className="empty-state">暂无申请</div>
          )}
          <div className="application-list">
            {applicationsQuery.data?.items.map((app) => (
              <div key={app.id} className="application-row">
                <div className="application-row-main">
                  <span className="application-applicant">
                    {app.applicant?.nickname ?? `用户${app.applicant_id}`}
                  </span>
                  <span className="application-position">
                    申请岗位：{app.position?.name ?? app.position_id}
                  </span>
                  {app.message && <span className="application-message">{app.message}</span>}
                  <ApplicationStatusBadge status={app.status} reason={app.reason} />
                </div>
                <div className="application-row-actions">
                  {app.status === 'pending' && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          decideMutation.mutate({ aid: app.id, action: 'approve' })
                        }
                      >
                        通过
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          decideMutation.mutate({ aid: app.id, action: 'reject' })
                        }
                      >
                        拒绝
                      </button>
                    </>
                  )}
                  {app.status === 'accepted' && (
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        decideMutation.mutate({ aid: app.id, action: 'revoke' })
                      }
                    >
                      撤销录取
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
