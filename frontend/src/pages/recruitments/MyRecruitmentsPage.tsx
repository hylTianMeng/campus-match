import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recruitmentApi } from '../../api/recruitment'
import StatusBadge from '../../components/ui/StatusBadge'
import { BizError } from '../../types/api'

export default function MyRecruitmentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['recruitments', 'mine'],
    queryFn: () => recruitmentApi.mine({ page_size: 50 }),
  })

  const action = useMutation({
    mutationFn: ({
      rid,
      type,
    }: {
      rid: number
      type: 'publish' | 'end' | 'delete'
    }) => {
      if (type === 'publish') return recruitmentApi.publish(rid)
      if (type === 'end') return recruitmentApi.end(rid)
      return recruitmentApi.remove(rid)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitments', 'mine'] })
    },
    onError: (e) => setError(e instanceof BizError ? e.message : '操作失败'),
  })

  return (
    <div className="page-container">
      <div className="page-head-row">
        <h1 className="page-title">我的发布</h1>
        <button className="btn btn-primary" onClick={() => navigate('/app/recruitments/new')}>
          + 新建招募
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {isLoading && <div className="empty-state">加载中…</div>}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="empty-state">还没有发布过招募</div>
      )}

      <div className="list-stack">
        {data?.items.map((item) => (
          <div key={item.id} className="list-row">
            <div className="list-row-main">
              <div className="list-row-title">{item.title}</div>
              <div className="list-row-meta">
                <StatusBadge status={item.status} endReason={item.end_reason} />
                <span>
                  {item.positions.length} 个岗位 ·{' '}
                  {item.positions.reduce((s, p) => s + p.accepted_count, 0)}/
                  {item.positions.reduce((s, p) => s + p.capacity, 0)} 已录
                </span>
              </div>
            </div>
            <div className="list-row-actions">
              <button className="btn btn-sm" onClick={() => navigate(`/recruitments/${item.id}`)}>
                查看
              </button>
              {item.status === 'draft' && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() => navigate(`/app/recruitments/${item.id}/edit`)}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => action.mutate({ rid: item.id, type: 'publish' })}
                  >
                    发布
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => action.mutate({ rid: item.id, type: 'delete' })}
                  >
                    删除
                  </button>
                </>
              )}
              {item.status === 'open' && (
                <button
                  className="btn btn-sm"
                  onClick={() => action.mutate({ rid: item.id, type: 'end' })}
                >
                  结束招募
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
