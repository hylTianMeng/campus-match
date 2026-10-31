"""一对一私信服务。"""
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.core.exceptions import BizError, ErrorCode
from app.models import (
    Conversation,
    ConversationParticipant,
    Message,
    User,
)
from app.utils import iso, utcnow


class MessageService:
    """私信会话/消息/未读游标。"""

    @staticmethod
    def _serialize_message(msg: Message) -> dict:
        return {
            "id": msg.id,
            "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id,
            "content": msg.content,
            "created_at": iso(msg.created_at),
        }

    @staticmethod
    def _unread_for(
        session, conversation_id: int, user_id: int, last_read_message_id: int | None
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.sender_id != user_id,
            )
        )
        if last_read_message_id is not None:
            stmt = stmt.where(Message.id > last_read_message_id)
        return int(session.execute(stmt).scalar_one())

    def _serialize_conversation(self, session, conv: Conversation, user_id: int) -> dict:
        other_id = conv.user_b_id if conv.user_a_id == user_id else conv.user_a_id
        other = session.get(User, other_id)
        participant = session.execute(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_id == conv.id,
                ConversationParticipant.user_id == user_id,
            )
        ).scalar_one_or_none()
        last_msg = session.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        cursor = participant.last_read_message_id if participant else None

        return {
            "id": conv.id,
            "other_user": (
                {"id": other.id, "nickname": other.nickname, "avatar_url": other.avatar_url}
                if other
                else None
            ),
            "last_message": self._serialize_message(last_msg) if last_msg else None,
            "unread_count": self._unread_for(session, conv.id, user_id, cursor),
            "updated_at": iso(conv.updated_at),
        }

    @staticmethod
    def _bump_read_cursor(
        session, conversation_id: int, user_id: int, message_id: int
    ) -> None:
        participant = session.execute(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
        ).scalar_one_or_none()
        if participant is None:
            return
        if (
            participant.last_read_message_id is None
            or participant.last_read_message_id < message_id
        ):
            participant.last_read_message_id = message_id

    def get_or_create_conversation(self, user_id: int, target_user_id: int) -> dict:
        with SessionLocal() as session:
            with session.begin():
                if user_id == target_user_id:
                    raise BizError(ErrorCode.INVALID_PARAM, "不能与自己私信")
                target = session.get(User, target_user_id)
                if target is None:
                    raise BizError(ErrorCode.NOT_FOUND, "用户不存在")

                a, b = sorted((user_id, target_user_id))
                conv = session.execute(
                    select(Conversation).where(
                        Conversation.user_a_id == a, Conversation.user_b_id == b
                    )
                ).scalar_one_or_none()
                if conv is None:
                    conv = Conversation(user_a_id=a, user_b_id=b)
                    session.add(conv)
                    session.flush()
                    session.add(
                        ConversationParticipant(conversation_id=conv.id, user_id=a)
                    )
                    session.add(
                        ConversationParticipant(conversation_id=conv.id, user_id=b)
                    )

                return self._serialize_conversation(session, conv, user_id)

    def send(self, sender_id: int, conversation_id: int, content: str) -> dict:
        with SessionLocal() as session:
            with session.begin():
                conv = session.get(Conversation, conversation_id)
                if conv is None:
                    raise BizError(ErrorCode.NOT_FOUND, "会话不存在")
                if sender_id not in (conv.user_a_id, conv.user_b_id):
                    raise BizError(ErrorCode.FORBIDDEN, "非会话成员")

                msg = Message(
                    conversation_id=conversation_id,
                    sender_id=sender_id,
                    content=content.strip(),
                )
                session.add(msg)
                session.flush()

                # 发送者自己的消息视作已读；接收者游标不动
                self._bump_read_cursor(session, conversation_id, sender_id, msg.id)
                # 显式更新会话 updated_at，供列表按最近消息排序
                conv.updated_at = utcnow()

                return self._serialize_message(msg)

    def list_conversations(self, user_id: int) -> list[dict]:
        with SessionLocal() as session:
            participants = session.execute(
                select(ConversationParticipant).where(
                    ConversationParticipant.user_id == user_id
                )
            ).scalars().all()
            items = []
            for p in participants:
                conv = session.get(Conversation, p.conversation_id)
                if conv is None:
                    continue
                items.append(self._serialize_conversation(session, conv, user_id))
            items.sort(key=lambda x: x["updated_at"] or "", reverse=True)
            return items

    def list_messages(
        self,
        user_id: int,
        conversation_id: int,
        after_id: int | None = None,
        limit: int = 50,
    ) -> list[dict]:
        with SessionLocal() as session:
            conv = session.get(Conversation, conversation_id)
            if conv is None:
                raise BizError(ErrorCode.NOT_FOUND, "会话不存在")
            if user_id not in (conv.user_a_id, conv.user_b_id):
                raise BizError(ErrorCode.FORBIDDEN, "非会话成员")

            limit = min(max(1, limit), 100)
            stmt = select(Message).where(Message.conversation_id == conversation_id)
            if after_id:
                stmt = stmt.where(Message.id > after_id)
            stmt = stmt.order_by(Message.id.desc()).limit(limit)

            msgs = list(reversed(session.execute(stmt).scalars().all()))
            return [self._serialize_message(m) for m in msgs]

    def mark_read(self, user_id: int, conversation_id: int) -> None:
        with SessionLocal() as session:
            with session.begin():
                conv = session.get(Conversation, conversation_id)
                if conv is None:
                    raise BizError(ErrorCode.NOT_FOUND, "会话不存在")
                if user_id not in (conv.user_a_id, conv.user_b_id):
                    raise BizError(ErrorCode.FORBIDDEN, "非会话成员")

                latest = session.execute(
                    select(func.max(Message.id)).where(
                        Message.conversation_id == conversation_id
                    )
                ).scalar_one()
                if latest is not None:
                    self._bump_read_cursor(session, conversation_id, user_id, latest)

    def unread_count(self, user_id: int) -> int:
        with SessionLocal() as session:
            participants = session.execute(
                select(ConversationParticipant).where(
                    ConversationParticipant.user_id == user_id
                )
            ).scalars().all()
            total = 0
            for p in participants:
                total += self._unread_for(
                    session, p.conversation_id, user_id, p.last_read_message_id
                )
            return total
