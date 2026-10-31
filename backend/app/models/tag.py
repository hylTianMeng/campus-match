"""标签模型与多对多关联表。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Table,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.utils import utcnow


class Tag(Base):
    """标签（MVP 只用技能标签；kind 保留便于扩展）。"""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    kind: Mapped[str] = mapped_column(
        Enum("skill", "interest", "recruitment"),
        nullable=False,
        default="skill",
        server_default="skill",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )

    __table_args__ = (
        UniqueConstraint("name", "kind", name="uq_tags_name_kind"),
    )


recruitment_tags = Table(
    "recruitment_tags",
    Base.metadata,
    Column(
        "recruitment_id",
        BigInteger,
        ForeignKey("recruitments.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        BigInteger,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

position_tags = Table(
    "position_tags",
    Base.metadata,
    Column(
        "position_id",
        BigInteger,
        ForeignKey("positions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        BigInteger,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
