import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { messageApi } from '../../api/message'
import { useMessages } from '../../hooks/useMessages'
import { useAuthStore } from '../../stores/auth'
import { BizError } from '../../types/api'

export default function ChatPage() {
  const { cid } = useParams()
  const convId = Number(cid)
  const userId = useAuthStore((s) => s.user?.id)
  const qc = useQueryClient()

  const { data: messages } = useMessages(convId)
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!convId) return
    messageApi
      .markRead(convId)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['unread'] })
        qc.invalidateQueries({ queryKey: ['conversations'] })
      })
      .catch(() => {})
  }, [convId, qc, messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const text = content.trim()
    if (!text) return
    setError('')
    try {
      await messageApi.send(convId, text)
      setContent('')
      qc.invalidateQueries({ queryKey: ['messages', convId] })
      qc.invalidateQueries({ queryKey: ['conversations'] })
    } catch (err) {
      setError(err instanceof BizError ? err.message : '发送失败')
    }
  }

  return (
    <div className="page-container chat-page">
      <div className="chat-messages">
        {messages?.map((m) => (
          <div
            key={m.id}
            className={`chat-bubble ${m.sender_id === userId ? 'chat-own' : 'chat-other'}`}
          >
            <div className="chat-bubble-content">{m.content}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error-text">{error}</div>}

      <form className="chat-input-row" onSubmit={send}>
        <input
          className="text-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入消息…"
        />
        <button className="btn btn-primary" type="submit">
          发送
        </button>
      </form>
    </div>
  )
}
