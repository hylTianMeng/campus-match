"""招募与岗位模型。"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.utils import utcnow


class Recruitment(Base):
    """招募（MVP：无 category_id、无 is_taken_down）。"""

    __tablename__ = "recruitments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    activity_time: Mapped[str | None] = mapped_column(String(100), nullable=True)
    deadline_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("draft", "open", "ended"),
        nullable=False,
        default="draft",
        server_default="draft",
    )
    end_reason: Mapped[str | None] = mapped_column(
        Enum("filled", "expired", "manual"), nullable=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    positions: Mapped[list["Position"]] = relationship(
        back_populates="recruitment",
        cascade="all, delete-orphan",
        order_by="Position.sort_order",
    )


class Position(Base):
    """岗位（独立名额；accepted_count 为派生值不落库）。"""

    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    recruitment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("recruitments.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )

    recruitment: Mapped[Recruitment] = relationship(back_populates="positions")
