"""消息端点。"""
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user, require_verified
from app.core.exceptions import ok
from app.models import User
from app.schemas.message import ConversationCreateRequest, MessageSendRequest
from app.services.message_service import MessageService

router = APIRouter()
service = MessageService()


@router.post("/conversations")
def create_conversation(
    body: ConversationCreateRequest, user: User = Depends(require_verified)
):
    """创建/获取与某用户的一对一会话。"""
    return ok(service.get_or_create_conversation(user.id, body.target_user_id))


@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user)):
    """会话列表（含对方信息/最后一条/未读数）。"""
    return ok(service.list_conversations(user.id))


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: int,
    user: User = Depends(get_current_user),
    after_id: int | None = Query(default=None),
    limit: int = Query(default=50),
):
    """消息列表（after_id 增量 + limit，默认最近 50 条）。"""
    return ok(
        service.list_messages(user.id, conversation_id, after_id=after_id, limit=limit)
    )


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    body: MessageSendRequest,
    user: User = Depends(require_verified),
):
    """发送私信。"""
    return ok(service.send(user.id, conversation_id, body.content))


@router.post("/conversations/{conversation_id}/read")
def mark_read(conversation_id: int, user: User = Depends(get_current_user)):
    """标记已读。"""
    service.mark_read(user.id, conversation_id)
    return ok(None, "已读")


@router.get("/me/unread")
def unread_count(user: User = Depends(get_current_user)):
    """全站未读总数（= 私信未读之和）。"""
    return ok(service.unread_count(user.id))
