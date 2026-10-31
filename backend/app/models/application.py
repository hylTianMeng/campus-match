"""申请与申请操作历史模型。

applications 表包含两个 STORED 生成列 + 部分唯一索引，用于在并发下兜底
BR-05/BR-06：

- ``pending_guard``：同岗位同用户最多一条 pending
- ``accepted_guard``：同招募同用户最多一条 accepted
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Computed,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.utils import utcnow


class Application(Base):
    """岗位申请。"""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    recruitment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("recruitments.id", ondelete="RESTRICT"), nullable=False
    )
    position_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("positions.id", ondelete="RESTRICT"), nullable=False
    )
    applicant_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "not_passed", "withdrawn", "expired"),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    reason: Mapped[str] = mapped_column(
        Enum(
            "submitted",
            "approved",
            "rejected",
            "applicant_withdrawn",
            "accepted_other_position",
            "capacity_full",
            "deadline_reached",
            "manual_end",
            "offer_revoked",
            "offer_abandoned",
        ),
        nullable=False,
        default="submitted",
        server_default="submitted",
    )

    # STORED 生成列：仅在对应状态下取 applicant_id，其余为 NULL
    pending_guard: Mapped[int | None] = mapped_column(
        BigInteger,
        Computed(
            "CASE WHEN `status` = 'pending' THEN `applicant_id` ELSE NULL END",
            persisted=True,
        ),
        nullable=True,
    )
    accepted_guard: Mapped[int | None] = mapped_column(
        BigInteger,
        Computed(
            "CASE WHEN `status` = 'accepted' THEN `applicant_id` ELSE NULL END",
            persisted=True,
        ),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_app_recruitment", "recruitment_id"),
        Index("idx_app_position_status", "position_id", "status"),
        Index("idx_app_applicant", "applicant_id"),
        UniqueConstraint("position_id", "pending_guard", name="uq_app_pending"),
        UniqueConstraint("recruitment_id", "accepted_guard", name="uq_app_accepted"),
    )


class ApplicationHistory(Base):
    """申请操作历史（状态与 reason 分离，追加式，审计）。"""

    __tablename__ = "application_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    application_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_status: Mapped[str] = mapped_column(String(20), nullable=False)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    operator_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )

    __table_args__ = (Index("idx_apphist_app", "application_id", "created_at"),)
