import { request } from './client'
import type { ConversationOut, MessageOut } from '../types/message'

export const messageApi = {
  createConversation: (target_user_id: number) =>
    request.post<ConversationOut>('/conversations', { target_user_id }),
  listConversations: () => request.get<ConversationOut[]>('/conversations'),
  listMessages: (cid: number, params?: { after_id?: number; limit?: number }) =>
    request.get<MessageOut[]>(`/conversations/${cid}/messages`, { params }),
  send: (cid: number, content: string) =>
    request.post<MessageOut>(`/conversations/${cid}/messages`, { content }),
  markRead: (cid: number) => request.post<null>(`/conversations/${cid}/read`),
  unread: () => request.get<number>('/me/unread'),
}
