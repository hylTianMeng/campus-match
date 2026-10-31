"""用户模型。"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.utils import utcnow


class User(Base):
    """用户账号（MVP：注册即认证，无 role/is_admin）。"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(32), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    status: Mapped[str] = mapped_column(
        Enum("active", "banned", "deleted"),
        nullable=False,
        default="active",
        server_default="active",
    )
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
