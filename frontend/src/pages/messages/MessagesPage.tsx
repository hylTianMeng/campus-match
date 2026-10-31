import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useConversations } from '../../hooks/useConversations'

export default function MessagesPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useConversations()

  return (
    <div className="page-container">
      <h1 className="page-title">消息</h1>
      {isLoading && <div className="empty-state">加载中…</div>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="empty-state">暂无会话</div>
      )}

      <div className="list-stack">
        {data?.map((conv) => (
          <div
            key={conv.id}
            className="list-row conversation-row"
            onClick={() => navigate(`/app/messages/${conv.id}`)}
          >
            <div className="conversation-avatar">
              {conv.other_user.nickname[0] ?? '友'}
            </div>
            <div className="list-row-main">
              <div className="list-row-title">{conv.other_user.nickname}</div>
              <div className="list-row-meta">
                <span className="muted">
                  {conv.last_message?.content ?? '开始聊天吧'}
                </span>
              </div>
            </div>
            <div className="conversation-right">
              <div className="muted">
                {conv.updated_at ? dayjs(conv.updated_at).format('MM-DD HH:mm') : ''}
              </div>
              {conv.unread_count > 0 && (
                <span className="unread-badge">{conv.unread_count}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
