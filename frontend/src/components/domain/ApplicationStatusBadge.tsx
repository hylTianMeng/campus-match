interface Props {
  status: string
  reason?: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  accepted: '已录取',
  not_passed: '未通过',
  withdrawn: '已撤回',
  expired: '已过期',
}

const DETAIL_REASONS = new Set([
  'accepted_other_position',
  'capacity_full',
  'deadline_reached',
  'manual_end',
  'offer_revoked',
  'offer_abandoned',
])

const REASON_LABELS: Record<string, string> = {
  accepted_other_position: '已在其他岗位录取',
  capacity_full: '岗位名额已满',
  deadline_reached: '招募已截止',
  manual_end: '招募已结束',
  offer_revoked: '录取已撤销',
  offer_abandoned: '已放弃录取',
}

export default function ApplicationStatusBadge({ status, reason }: Props) {
  const label = STATUS_LABELS[status] ?? status
  const detail = reason && DETAIL_REASONS.has(reason) ? REASON_LABELS[reason] : null

  return (
    <span className="app-status">
      <span className={`status-badge status-${status}`}>{label}</span>
      {detail && <span className="app-status-detail">{detail}</span>}
    </span>
  )
}
