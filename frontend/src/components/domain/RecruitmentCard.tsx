import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import type { RecruitmentListOut } from '../../types/recruitment'
import StatusBadge from '../ui/StatusBadge'

export default function RecruitmentCard({ item }: { item: RecruitmentListOut }) {
  const navigate = useNavigate()
  const filled = item.positions.reduce((s, p) => s + p.accepted_count, 0)
  const total = item.positions.reduce((s, p) => s + p.capacity, 0)
  const isOver = item.status !== 'open' || dayjs(item.deadline_at).isBefore(dayjs())

  return (
    <div
      className="recruitment-card"
      onClick={() => navigate(`/recruitments/${item.id}`)}
    >
      <div className="recruitment-card-head">
        <h3 className="recruitment-card-title">{item.title}</h3>
        <StatusBadge status={item.status} endReason={item.end_reason} />
      </div>

      {item.tags.length > 0 && (
        <div className="recruitment-card-tags">
          {item.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="recruitment-card-meta">
        <span>{item.owner.nickname}</span>
        {item.location && <span>{item.location}</span>}
        <span>
          已录 {filled}/{total}
        </span>
      </div>

      <div className="recruitment-card-deadline">
        {isOver ? '已截止' : `截止 ${dayjs(item.deadline_at).format('MM-DD HH:mm')}`}
      </div>
    </div>
  )
}
