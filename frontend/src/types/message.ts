export interface MessageOut {
  id: number
  conversation_id: number
  sender_id: number
  content: string
  created_at: string
}

export interface ConversationOut {
  id: number
  other_user: {
    id: number
    nickname: string
    avatar_url: string | null
  }
  last_message: MessageOut | null
  unread_count: number
  updated_at: string | null
}
