"""招募与岗位服务。

职责：招募生命周期（草稿/发布/编辑/结束/删除）、岗位增删（仅草稿）、
到期惰性检查、大厅列表/详情查询。

并发约定：所有写路径以 recruitments 行锁（with_for_update）为串行化点；
满员/到期/结束联动只在本服务与 ApplicationService 中计算。
"""
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.exceptions import BizError, ErrorCode
from app.models import (
    Application,
    ApplicationHistory,
    Position,
    Recruitment,
    Tag,
    User,
    recruitment_tags,
)
from app.schemas.recruitment import (
    PositionCreateRequest,
    RecruitmentCreateRequest,
    RecruitmentUpdateRequest,
)
from app.utils import ensure_naive_utc, iso, utcnow
from app.utils.pagination import paginate


def position_status(
    rec_status: str,
    deadline_at,
    accepted_count: int,
    capacity: int,
    now,
) -> str:
    """岗位派生状态（available/full/closed）。"""
    if rec_status != "open":
        return "closed"
    if deadline_at is not None and deadline_at <= now:
        return "closed"
    if accepted_count >= capacity:
        return "full"
    return "available"


def expire_locked(session: Session, rec: Recruitment, now) -> None:
    """到期结束（必须在持有 recruitments 行锁时调用）。

    open + deadline<=now → ended/expired；待审 pending → expired/deadline_reached。
    """
    if rec.status != "open":
        return

    pendings = session.execute(
        select(Application)
        .where(
            Application.recruitment_id == rec.id,
            Application.status == "pending",
        )
        .with_for_update()
    ).scalars().all()

    for a in pendings:
        a.status = "expired"
        a.reason = "deadline_reached"
        a.decided_at = now
        session.add(
            ApplicationHistory(
                application_id=a.id,
                from_status="pending",
                to_status="expired",
                reason="deadline_reached",
                operator_id=None,
            )
        )

    rec.status = "ended"
    rec.end_reason = "expired"
    rec.ended_at = now


class RecruitmentService:
    """招募生命周期与查询。"""

    # ---------- 序列化辅助 ----------

    @staticmethod
    def _owner_out(owner: User) -> dict:
        return {
            "id": owner.id,
            "nickname": owner.nickname,
            "avatar_url": owner.avatar_url,
        }

    @staticmethod
    def _accepted_count(session: Session, position_id: int) -> int:
        return int(
            session.execute(
                select(func.count())
                .select_from(Application)
                .where(
                    Application.position_id == position_id,
                    Application.status == "accepted",
                )
            ).scalar_one()
        )

    @staticmethod
    def _tag_names(session: Session, recruitment_id: int) -> list[str]:
        tags = session.execute(
            select(Tag)
            .join(recruitment_tags, recruitment_tags.c.tag_id == Tag.id)
            .where(recruitment_tags.c.recruitment_id == recruitment_id)
            .order_by(Tag.name)
        ).scalars().all()
        return [t.name for t in tags]

    def _position_out(
        self, session: Session, pos: Position, rec: Recruitment, now
    ) -> dict:
        accepted_count = self._accepted_count(session, pos.id)
        return {
            "id": pos.id,
            "name": pos.name,
            "capacity": pos.capacity,
            "description": pos.description,
            "sort_order": pos.sort_order,
            "accepted_count": accepted_count,
            "status": position_status(
                rec.status, rec.deadline_at, accepted_count, pos.capacity, now
            ),
            "tags": [],  # MVP 未开放岗位技能标签编辑，保留字段供后续扩展
        }

    def _positions(self, session: Session, recruitment_id: int) -> list[Position]:
        return session.execute(
            select(Position)
            .where(Position.recruitment_id == recruitment_id)
            .order_by(Position.sort_order, Position.id)
        ).scalars().all()

    def _serialize_list_item(self, session: Session, rec: Recruitment, now) -> dict:
        owner = session.get(User, rec.owner_id)
        positions = self._positions(session, rec.id)
        return {
            "id": rec.id,
            "owner_id": rec.owner_id,
            "title": rec.title,
            "location": rec.location,
            "activity_time": rec.activity_time,
            "deadline_at": iso(rec.deadline_at),
            "status": rec.status,
            "end_reason": rec.end_reason,
            "published_at": iso(rec.published_at),
            "created_at": iso(rec.created_at),
            "owner": self._owner_out(owner),
            "tags": self._tag_names(session, rec.id),
            "positions": [
                self._position_out(session, p, rec, now) for p in positions
            ],
        }

    def _my_applications(self, session: Session, rec_id: int, user_id: int) -> list[dict]:
        apps = session.execute(
            select(Application)
            .where(
                Application.recruitment_id == rec_id,
                Application.applicant_id == user_id,
            )
            .order_by(Application.created_at.desc(), Application.id.desc())
        ).scalars().all()
        return [
            {
                "id": a.id,
                "position_id": a.position_id,
                "status": a.status,
                "reason": a.reason,
            }
            for a in apps
        ]

    def _has_any_application(self, session: Session, rec_id: int) -> bool:
        cnt = session.execute(
            select(func.count())
            .select_from(Application)
            .where(Application.recruitment_id == rec_id)
        ).scalar_one()
        return int(cnt) > 0

    def _has_accepted(self, session: Session, rec_id: int, user_id: int) -> bool:
        cnt = session.execute(
            select(func.count())
            .select_from(Application)
            .where(
                Application.recruitment_id == rec_id,
                Application.applicant_id == user_id,
                Application.status == "accepted",
            )
        ).scalar_one()
        return int(cnt) > 0

    def _allowed_actions(
        self,
        session: Session,
        rec: Recruitment,
        current_user: User | None,
        now,
    ) -> dict:
        is_owner = current_user is not None and current_user.id == rec.owner_id
        has_history = self._has_any_application(session, rec.id)
        can_apply = False

        if (
            current_user is not None
            and not is_owner
            and rec.status == "open"
            and rec.deadline_at > now
            and not self._has_accepted(session, rec.id, current_user.id)
        ):
            can_apply = True

        return {
            "apply": can_apply,
            "edit": is_owner and rec.status in ("draft", "open"),
            "publish": is_owner and rec.status == "draft",
            "end": is_owner and rec.status == "open",
            "delete": is_owner and not has_history,
            "manage_applications": is_owner and rec.status != "draft",
        }

    def _serialize_detail(
        self, session: Session, rec: Recruitment, current_user: User | None, now
    ) -> dict:
        owner = session.get(User, rec.owner_id)
        positions = self._positions(session, rec.id)
        data = {
            "id": rec.id,
            "owner_id": rec.owner_id,
            "title": rec.title,
            "description": rec.description,
            "location": rec.location,
            "activity_time": rec.activity_time,
            "deadline_at": iso(rec.deadline_at),
            "status": rec.status,
            "end_reason": rec.end_reason,
            "ended_at": iso(rec.ended_at),
            "published_at": iso(rec.published_at),
            "created_at": iso(rec.created_at),
            "updated_at": iso(rec.updated_at),
            "owner": self._owner_out(owner),
            "tags": self._tag_names(session, rec.id),
            "positions": [
                self._position_out(session, p, rec, now) for p in positions
            ],
            "my_applications": (
                self._my_applications(session, rec.id, current_user.id)
                if current_user is not None
                else []
            ),
            "allowed_actions": self._allowed_actions(session, rec, current_user, now),
        }
        return data

    # ---------- 标签同步 ----------

    def _sync_tags(
        self, session: Session, rec: Recruitment, names: list[str], creator_id: int
    ) -> None:
        session.execute(
            delete(recruitment_tags).where(
                recruitment_tags.c.recruitment_id == rec.id
            )
        )
        seen: set[str] = set()
        for raw in names:
            name = raw.strip()
            if not name or name in seen:
                continue
            seen.add(name)

            tag = session.execute(
                select(Tag).where(Tag.name == name, Tag.kind == "skill")
            ).scalar_one_or_none()
            if tag is None:
                tag = Tag(name=name, kind="skill", created_by=creator_id)
                session.add(tag)
                session.flush()

            session.execute(
                recruitment_tags.insert().values(
                    recruitment_id=rec.id, tag_id=tag.id
                )
            )

    # ---------- 生命周期 ----------

    def create(self, owner: User, payload: RecruitmentCreateRequest) -> dict:
        now = utcnow()
        deadline = ensure_naive_utc(payload.deadline_at)
        if deadline is None or deadline <= now:
            raise BizError(ErrorCode.INVALID_PARAM, "截止时间必须为未来时间")

        with SessionLocal() as session:
            with session.begin():
                rec = Recruitment(
                    owner_id=owner.id,
                    title=payload.title.strip(),
                    description=payload.description.strip(),
                    location=payload.location,
                    activity_time=payload.activity_time,
                    deadline_at=deadline,
                    status="draft",
                )
                session.add(rec)
                session.flush()

                for idx, p in enumerate(payload.positions):
                    session.add(
                        Position(
                            recruitment_id=rec.id,
                            name=p.name.strip(),
                            capacity=p.capacity,
                            description=p.description,
                            sort_order=idx,
                        )
                    )
                session.flush()  # 先落库岗位，供 publish 校验与详情序列化使用
                self._sync_tags(session, rec, payload.tags, owner.id)

                if payload.status == "open":
                    self._publish_locked(session, rec, now)

                session.flush()
                return self._serialize_detail(session, rec, owner, now)

    def update(
        self, owner: User, recruitment_id: int, payload: RecruitmentUpdateRequest
    ) -> dict:
        now = utcnow()
        with SessionLocal() as session:
            with session.begin():
                rec = session.get(Recruitment, recruitment_id)
                if rec is None:
                    raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
                if rec.owner_id != owner.id:
                    raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")
                if rec.status == "ended":
                    raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已结束，不可编辑")

                if payload.title is not None:
                    rec.title = payload.title.strip()
                if payload.description is not None:
                    rec.description = payload.description.strip()
                if payload.location is not None:
                    rec.location = payload.location
                if payload.activity_time is not None:
                    rec.activity_time = payload.activity_time

                if payload.deadline_at is not None:
                    if rec.status != "draft":
                        raise BizError(
                            ErrorCode.INVALID_PARAM, "发布后不可修改截止时间"
                        )
                    deadline = ensure_naive_utc(payload.deadline_at)
                    rec.deadline_at = deadline

                if payload.tags is not None:
                    self._sync_tags(session, rec, payload.tags, owner.id)

                return self._serialize_detail(session, rec, owner, now)

    def _publish_locked(self, session: Session, rec: Recruitment, now) -> None:
        if rec.status == "open":
            return
        if rec.status != "draft":
            raise BizError(ErrorCode.RECRUITMENT_CLOSED, "该招募已结束")

        positions = self._positions(session, rec.id)
        if not positions:
            raise BizError(ErrorCode.INVALID_PARAM, "至少需要一个岗位")
        if rec.deadline_at <= now:
            raise BizError(ErrorCode.INVALID_PARAM, "截止时间必须为未来时间")

        rec.status = "open"
        rec.published_at = now

    def publish(self, owner: User, recruitment_id: int) -> dict:
        now = utcnow()
        with SessionLocal() as session:
            with session.begin():
                rec = session.get(Recruitment, recruitment_id)
                if rec is None:
                    raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
                if rec.owner_id != owner.id:
                    raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")
                self._publish_locked(session, rec, now)
                return self._serialize_detail(session, rec, owner, now)

    def end_manually(self, owner: User, recruitment_id: int) -> dict:
        now = utcnow()
        session = SessionLocal()
        try:
            rec = session.execute(
                select(Recruitment)
                .where(Recruitment.id == recruitment_id)
                .with_for_update()
            ).scalar_one_or_none()
            if rec is None:
                raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
            if rec.owner_id != owner.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")

            if rec.status != "open":
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已结束")

            # 惰性到期优先于手动结束：先提交到期结果，再拒绝
            if rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")

            pendings = session.execute(
                select(Application)
                .where(
                    Application.recruitment_id == rec.id,
                    Application.status == "pending",
                )
                .with_for_update()
            ).scalars().all()
            for a in pendings:
                a.status = "expired"
                a.reason = "manual_end"
                a.decided_at = now
                session.add(
                    ApplicationHistory(
                        application_id=a.id,
                        from_status="pending",
                        to_status="expired",
                        reason="manual_end",
                        operator_id=owner.id,
                    )
                )

            rec.status = "ended"
            rec.end_reason = "manual"
            rec.ended_at = now

            result = self._serialize_detail(session, rec, owner, now)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def delete_conditionally(self, owner: User, recruitment_id: int) -> None:
        with SessionLocal() as session:
            with session.begin():
                rec = session.get(Recruitment, recruitment_id)
                if rec is None:
                    raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
                if rec.owner_id != owner.id:
                    raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")

                if self._has_any_application(session, rec.id):
                    raise BizError(
                        ErrorCode.HAS_HISTORY, "存在历史申请，不可删除"
                    )
                session.delete(rec)

    # ---------- 岗位增删（仅草稿） ----------

    def add_position(
        self, owner: User, recruitment_id: int, payload: PositionCreateRequest
    ) -> dict:
        with SessionLocal() as session:
            with session.begin():
                rec = session.get(Recruitment, recruitment_id)
                if rec is None:
                    raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
                if rec.owner_id != owner.id:
                    raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")
                if rec.status != "draft":
                    raise BizError(ErrorCode.RECRUITMENT_CLOSED, "仅草稿可增删岗位")

                max_sort = session.execute(
                    select(func.coalesce(func.max(Position.sort_order), 0)).where(
                        Position.recruitment_id == recruitment_id
                    )
                ).scalar_one()

                pos = Position(
                    recruitment_id=recruitment_id,
                    name=payload.name.strip(),
                    capacity=payload.capacity,
                    description=payload.description,
                    sort_order=int(max_sort) + 1,
                )
                session.add(pos)
                session.flush()
                return self._position_out(session, pos, rec, utcnow())

    def remove_position(
        self, owner: User, recruitment_id: int, position_id: int
    ) -> None:
        with SessionLocal() as session:
            with session.begin():
                rec = session.get(Recruitment, recruitment_id)
                if rec is None:
                    raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
                if rec.owner_id != owner.id:
                    raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")
                if rec.status != "draft":
                    raise BizError(ErrorCode.RECRUITMENT_CLOSED, "仅草稿可增删岗位")

                pos = session.get(Position, position_id)
                if pos is None or pos.recruitment_id != recruitment_id:
                    raise BizError(ErrorCode.NOT_FOUND, "岗位不存在")

                count = session.execute(
                    select(func.count())
                    .select_from(Position)
                    .where(Position.recruitment_id == recruitment_id)
                ).scalar_one()
                if int(count) <= 1:
                    raise BizError(ErrorCode.INVALID_PARAM, "至少保留一个岗位")

                session.delete(pos)

    # ---------- 到期 ----------

    def expire(self, recruitment_id: int) -> None:
        """供 APScheduler 兜底调用。"""
        now = utcnow()
        with SessionLocal() as session:
            with session.begin():
                rec = session.execute(
                    select(Recruitment)
                    .where(Recruitment.id == recruitment_id)
                    .with_for_update()
                ).scalar_one_or_none()
                if rec is None:
                    return
                if rec.status == "open" and rec.deadline_at <= now:
                    expire_locked(session, rec, now)

    # ---------- 查询 ----------

    def list(
        self,
        q: str | None = None,
        tag: str | None = None,
        status: str = "open",
        sort: str = "latest",
        page: int | None = None,
        page_size: int | None = None,
    ) -> dict:
        now = utcnow()
        with SessionLocal() as session:
            stmt = select(Recruitment)
            if status in ("open", "ended"):
                stmt = stmt.where(Recruitment.status == status)
            else:
                stmt = stmt.where(Recruitment.status == "open")

            if q:
                like = f"%{q.strip()}%"
                stmt = stmt.where(
                    or_(
                        Recruitment.title.like(like),
                        Recruitment.description.like(like),
                    )
                )

            if tag:
                stmt = (
                    stmt.join(
                        recruitment_tags,
                        recruitment_tags.c.recruitment_id == Recruitment.id,
                    )
                    .join(Tag, Tag.id == recruitment_tags.c.tag_id)
                    .where(Tag.name == tag.strip())
                )

            if sort == "deadline":
                stmt = stmt.order_by(Recruitment.deadline_at.asc(), Recruitment.id.asc())
            else:
                stmt = stmt.order_by(
                    Recruitment.published_at.desc(), Recruitment.id.desc()
                )

            result = paginate(session, stmt, page, page_size)
            result["items"] = [
                self._serialize_list_item(session, r, now) for r in result["items"]
            ]
            return result

    def mine(
        self,
        owner_id: int,
        status: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> dict:
        now = utcnow()
        with SessionLocal() as session:
            stmt = select(Recruitment).where(Recruitment.owner_id == owner_id)
            if status in ("draft", "open", "ended"):
                stmt = stmt.where(Recruitment.status == status)
            stmt = stmt.order_by(Recruitment.created_at.desc(), Recruitment.id.desc())

            result = paginate(session, stmt, page, page_size)
            result["items"] = [
                self._serialize_list_item(session, r, now) for r in result["items"]
            ]
            return result

    def get_detail(self, recruitment_id: int, current_user: User | None = None) -> dict:
        now = utcnow()
        with SessionLocal() as session:
            rec = session.get(Recruitment, recruitment_id)
            if rec is None:
                raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
            if rec.status == "draft" and (
                current_user is None or current_user.id != rec.owner_id
            ):
                raise BizError(ErrorCode.FORBIDDEN, "无权限查看草稿")
            return self._serialize_detail(session, rec, current_user, now)
