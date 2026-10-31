import { useAuthStore } from '../../stores/auth'
import type { PositionOut } from '../../types/recruitment'

const POSITION_LABELS: Record<string, string> = {
  available: '可申请',
  full: '已满员',
  closed: '已关闭',
}

interface Props {
  position: PositionOut
  canApply: boolean
  alreadyApplied: boolean
  isOwner: boolean
  onApply: (positionId: number) => void
}

interface StatusView {
  label: string
  className: string
}

function resolveStatusView(
  position: PositionOut,
  canApply: boolean,
  alreadyApplied: boolean,
  isOwner: boolean,
  loggedIn: boolean,
): StatusView {
  if (position.status !== 'available') {
    return {
      label: POSITION_LABELS[position.status] ?? position.status,
      className: `pos-${position.status}`,
    }
  }

  // 岗位可用时，标签必须与按钮口径一致，避免“可申请/不可申请”自相矛盾。
  if (alreadyApplied) return { label: '已申请', className: 'pos-applied' }
  if (isOwner) return { label: '你的招募', className: 'pos-owner' }
  if (canApply) return { label: '可申请', className: 'pos-available' }
  return loggedIn
    ? { label: '不可申请', className: 'pos-closed' }
    : { label: '登录后可申请', className: 'pos-available' }
}

export default function PositionCard({
  position,
  canApply,
  alreadyApplied,
  isOwner,
  onApply,
}: Props) {
  const loggedIn = useAuthStore((s) => !!s.accessToken)

  const buttonText = !loggedIn
    ? '登录后申请'
    : alreadyApplied
      ? '已申请'
      : canApply
        ? '申请'
        : '不可申请'

  const disabled = !loggedIn || alreadyApplied || !canApply

  const statusView = resolveStatusView(
    position,
    canApply,
    alreadyApplied,
    isOwner,
    loggedIn,
  )

  return (
    <div className="position-card">
      <div className="position-card-head">
        <h4 className="position-card-name">{position.name}</h4>
        <span className={`position-status ${statusView.className}`}>
          {statusView.label}
        </span>
      </div>

      <p className="position-card-desc">{position.description || '暂无岗位说明'}</p>

      <div className="position-card-meta">
        <span>名额 {position.capacity}</span>
        <span>已录 {position.accepted_count}</span>
      </div>

      {position.tags.length > 0 && (
        <div className="position-card-tags">
          {position.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary position-apply-btn"
        disabled={disabled}
        onClick={() => onApply(position.id)}
      >
        {buttonText}
      </button>
    </div>
  )
}
