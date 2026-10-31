"""私信会话、参与者与消息模型。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.utils import utcnow


class Conversation(Base):
    """一对一私信会话（归一化 user_a_id < user_b_id）。"""

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_a_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    user_b_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_conv_pair"),
        Index("idx_conv_b", "user_b_id"),
    )


class ConversationParticipant(Base):
    """会话参与者与未读游标。"""

    __tablename__ = "conversation_participants"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    last_read_message_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_cp"),
        Index("idx_cp_user", "user_id"),
    )


class Message(Base):
    """私信消息。"""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )

    __table_args__ = (Index("idx_msg_conv", "conversation_id", "id"),)
