interface Props {
  status: string
  endReason?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  open: '招募中',
  ended: '已结束',
}

const END_REASON_LABELS: Record<string, string> = {
  filled: '已满员',
  expired: '已截止',
  manual: '已结束',
}

export default function StatusBadge({ status, endReason }: Props) {
  const label =
    status === 'ended'
      ? END_REASON_LABELS[endReason ?? ''] ?? '已结束'
      : STATUS_LABELS[status] ?? status

  return <span className={`status-badge status-${status}`}>{label}</span>
}
