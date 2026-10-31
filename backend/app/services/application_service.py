"""申请与审核服务（核心并发事务）。

串行化点：recruitments 行锁（SELECT ... FOR UPDATE）。
录取、拒绝、撤回、放弃、撤销录取、提交申请全部共享同一条 recruitments 行锁边界，
杜绝超额与中间态；applications 生成列唯一索引兜底 BR-05/BR-06。

锁顺序统一：先 recruitments 行锁 → 再 applications 行锁。

事务管理说明：
写路径使用显式 ``commit/rollback`` 而非 ``with session.begin()``，原因是在
「惰性到期」场景下需要**先提交到期结果（ended/expired），再拒绝本次操作**。
若用 ``with session.begin()``，到期后 raise 会连同到期结果一起回滚，违反 BR-08。
"""
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.core.exceptions import BizError, ErrorCode
from app.models import (
    Application,
    ApplicationHistory,
    Position,
    Recruitment,
    User,
)
from app.services.recruitment_service import expire_locked
from app.utils import iso, utcnow
from app.utils.pagination import paginate


class ApplicationService:
    """申请提交、审核与并发联动。"""

    @staticmethod
    def _serialize_app(session, app: Application) -> dict:
        position = session.get(Position, app.position_id)
        recruitment = session.get(Recruitment, app.recruitment_id)
        applicant = session.get(User, app.applicant_id)
        return {
            "id": app.id,
            "recruitment_id": app.recruitment_id,
            "position_id": app.position_id,
            "applicant_id": app.applicant_id,
            "message": app.message,
            "status": app.status,
            "reason": app.reason,
            "created_at": iso(app.created_at),
            "decided_at": iso(app.decided_at),
            "position": (
                {"id": position.id, "name": position.name} if position else None
            ),
            "recruitment": (
                {
                    "id": recruitment.id,
                    "title": recruitment.title,
                    "status": recruitment.status,
                }
                if recruitment
                else None
            ),
            "applicant": (
                {
                    "id": applicant.id,
                    "nickname": applicant.nickname,
                    "avatar_url": applicant.avatar_url,
                }
                if applicant
                else None
            ),
        }

    @staticmethod
    def _all_positions_full(session, recruitment_id: int) -> bool:
        positions = session.execute(
            select(Position).where(Position.recruitment_id == recruitment_id)
        ).scalars().all()
        for p in positions:
            cnt = session.execute(
                select(func.count())
                .select_from(Application)
                .where(
                    Application.position_id == p.id,
                    Application.status == "accepted",
                )
            ).scalar_one()
            if int(cnt) < p.capacity:
                return False
        return True

    def submit(
        self,
        applicant: User,
        recruitment_id: int,
        position_id: int,
        message: str | None,
    ) -> dict:
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

            if rec.status != "open":
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募未开放申请")

            if rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")

            if rec.owner_id == applicant.id:
                raise BizError(ErrorCode.SELF_APPLY, "不能申请自己发布的招募")

            position = session.get(Position, position_id)
            if position is None or position.recruitment_id != recruitment_id:
                raise BizError(ErrorCode.NOT_FOUND, "岗位不存在")

            # 同招募已 accepted（BR-05）
            has_accepted = session.execute(
                select(func.count())
                .select_from(Application)
                .where(
                    Application.recruitment_id == rec.id,
                    Application.applicant_id == applicant.id,
                    Application.status == "accepted",
                )
            ).scalar_one()
            if int(has_accepted) > 0:
                raise BizError(ErrorCode.CONFLICT, "你已被该招募录取")

            # 同岗位已有 pending（BR-05）
            has_pending = session.execute(
                select(func.count())
                .select_from(Application)
                .where(
                    Application.position_id == position.id,
                    Application.applicant_id == applicant.id,
                    Application.status == "pending",
                )
            ).scalar_one()
            if int(has_pending) > 0:
                raise BizError(ErrorCode.CONFLICT, "你已提交过该岗位的申请")

            # 岗位名额已满（BR-04）
            accepted_cnt = session.execute(
                select(func.count())
                .select_from(Application)
                .where(
                    Application.position_id == position.id,
                    Application.status == "accepted",
                )
            ).scalar_one()
            if int(accepted_cnt) >= position.capacity:
                raise BizError(ErrorCode.POSITION_FULL, "岗位名额已满")

            app = Application(
                recruitment_id=rec.id,
                position_id=position.id,
                applicant_id=applicant.id,
                message=message,
                status="pending",
                reason="submitted",
            )
            session.add(app)
            session.flush()
            session.add(
                ApplicationHistory(
                    application_id=app.id,
                    from_status="",
                    to_status="pending",
                    reason="submitted",
                    operator_id=applicant.id,
                )
            )
            result = self._serialize_app(session, app)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def approve(self, operator: User, application_id: int) -> dict:
        now = utcnow()
        session = SessionLocal()
        try:
            # ① 先定位申请，拿到 recruitment_id
            app = session.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if app is None:
                raise BizError(ErrorCode.NOT_FOUND, "申请不存在")

            # ② 锁招募行 = 串行化点
            rec = session.execute(
                select(Recruitment)
                .where(Recruitment.id == app.recruitment_id)
                .with_for_update()
            ).scalar_one()
            if rec.owner_id != operator.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅发布者可审核")

            # ③ 惰性到期：锁内复检 deadline，先提交到期结果再拒绝
            if rec.status == "open" and rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")

            if rec.status != "open":
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已结束")

            # ④ 申请行再锁 + 状态复检
            app = session.execute(
                select(Application)
                .where(Application.id == application_id)
                .with_for_update()
            ).scalar_one()
            if app.status != "pending":
                raise BizError(ErrorCode.CONFLICT, "该申请已处理")

            position = session.get(Position, app.position_id)

            # ⑤ BR-04 名额校验：锁内原子 count accepted < capacity
            accepted_cnt = session.execute(
                select(func.count())
                .select_from(Application)
                .where(
                    Application.position_id == app.position_id,
                    Application.status == "accepted",
                )
            ).scalar_one()
            if int(accepted_cnt) >= position.capacity:
                raise BizError(ErrorCode.POSITION_FULL, "岗位名额已满")

            # ⑥ 落库 accepted，并立即 flush，保证后续满员查询不误改本条
            app.status = "accepted"
            app.reason = "approved"
            app.decided_at = now
            session.flush()

            # ⑦ BR-06 顺序敏感：先撤回同人同招募其它 pending
            others = session.execute(
                select(Application)
                .where(
                    Application.recruitment_id == rec.id,
                    Application.applicant_id == app.applicant_id,
                    Application.status == "pending",
                    Application.id != app.id,
                )
                .with_for_update()
            ).scalars().all()
            for o in others:
                o.status = "withdrawn"
                o.reason = "accepted_other_position"
                o.decided_at = now
                session.add(
                    ApplicationHistory(
                        application_id=o.id,
                        from_status="pending",
                        to_status="withdrawn",
                        reason="accepted_other_position",
                        operator_id=operator.id,
                    )
                )

            # ⑧ 该岗满员 → 剩余 pending 全部 capacity_full（不留候补）
            if int(accepted_cnt) + 1 >= position.capacity:
                remaining = session.execute(
                    select(Application)
                    .where(
                        Application.position_id == app.position_id,
                        Application.status == "pending",
                    )
                    .with_for_update()
                ).scalars().all()
                for r in remaining:
                    r.status = "not_passed"
                    r.reason = "capacity_full"
                    r.decided_at = now
                    session.add(
                        ApplicationHistory(
                            application_id=r.id,
                            from_status="pending",
                            to_status="not_passed",
                            reason="capacity_full",
                            operator_id=operator.id,
                        )
                    )

            # ⑨ BR-07 全岗满员 → 同一事务 ended/filled
            if self._all_positions_full(session, rec.id):
                rec.status = "ended"
                rec.end_reason = "filled"
                rec.ended_at = now

            # ⑩ 追加操作历史
            session.add(
                ApplicationHistory(
                    application_id=app.id,
                    from_status="pending",
                    to_status="accepted",
                    reason="approved",
                    operator_id=operator.id,
                )
            )

            result = self._serialize_app(session, app)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def reject(self, operator: User, application_id: int) -> dict:
        now = utcnow()
        session = SessionLocal()
        try:
            app = session.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if app is None:
                raise BizError(ErrorCode.NOT_FOUND, "申请不存在")

            rec = session.execute(
                select(Recruitment)
                .where(Recruitment.id == app.recruitment_id)
                .with_for_update()
            ).scalar_one()
            if rec.owner_id != operator.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅发布者可审核")

            if rec.status == "open" and rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")
            if rec.status != "open":
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已结束")

            app = session.execute(
                select(Application)
                .where(Application.id == application_id)
                .with_for_update()
            ).scalar_one()
            if app.status != "pending":
                raise BizError(ErrorCode.CONFLICT, "该申请已处理")

            app.status = "not_passed"
            app.reason = "rejected"
            app.decided_at = now
            session.add(
                ApplicationHistory(
                    application_id=app.id,
                    from_status="pending",
                    to_status="not_passed",
                    reason="rejected",
                    operator_id=operator.id,
                )
            )
            result = self._serialize_app(session, app)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def withdraw(self, applicant: User, application_id: int) -> dict:
        now = utcnow()
        session = SessionLocal()
        try:
            app = session.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if app is None:
                raise BizError(ErrorCode.NOT_FOUND, "申请不存在")
            if app.applicant_id != applicant.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅申请者可操作")

            rec = session.execute(
                select(Recruitment)
                .where(Recruitment.id == app.recruitment_id)
                .with_for_update()
            ).scalar_one()

            if rec.status == "open" and rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")

            if rec.status != "open":
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已结束，不可撤回")

            app = session.execute(
                select(Application)
                .where(Application.id == application_id)
                .with_for_update()
            ).scalar_one()
            if app.status != "pending":
                raise BizError(ErrorCode.CONFLICT, "当前状态不可撤回")

            app.status = "withdrawn"
            app.reason = "applicant_withdrawn"
            app.decided_at = now
            session.add(
                ApplicationHistory(
                    application_id=app.id,
                    from_status="pending",
                    to_status="withdrawn",
                    reason="applicant_withdrawn",
                    operator_id=applicant.id,
                )
            )
            result = self._serialize_app(session, app)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def abandon(self, applicant: User, application_id: int) -> dict:
        now = utcnow()
        session = SessionLocal()
        try:
            app = session.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if app is None:
                raise BizError(ErrorCode.NOT_FOUND, "申请不存在")
            if app.applicant_id != applicant.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅申请者可操作")

            rec = session.execute(
                select(Recruitment)
                .where(Recruitment.id == app.recruitment_id)
                .with_for_update()
            ).scalar_one()

            if rec.status != "open":
                raise BizError(
                    ErrorCode.RECRUITMENT_CLOSED, "招募已结束，不可放弃录取"
                )
            if rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")

            app = session.execute(
                select(Application)
                .where(Application.id == application_id)
                .with_for_update()
            ).scalar_one()
            if app.status != "accepted":
                raise BizError(ErrorCode.CONFLICT, "当前状态不可放弃")

            app.status = "withdrawn"
            app.reason = "offer_abandoned"
            app.decided_at = now
            session.add(
                ApplicationHistory(
                    application_id=app.id,
                    from_status="accepted",
                    to_status="withdrawn",
                    reason="offer_abandoned",
                    operator_id=applicant.id,
                )
            )
            result = self._serialize_app(session, app)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def revoke_offer(self, operator: User, application_id: int) -> dict:
        now = utcnow()
        session = SessionLocal()
        try:
            app = session.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if app is None:
                raise BizError(ErrorCode.NOT_FOUND, "申请不存在")

            rec = session.execute(
                select(Recruitment)
                .where(Recruitment.id == app.recruitment_id)
                .with_for_update()
            ).scalar_one()
            if rec.owner_id != operator.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")

            if rec.status != "open":
                raise BizError(
                    ErrorCode.RECRUITMENT_CLOSED, "招募已结束，不可撤销录取"
                )
            if rec.deadline_at <= now:
                expire_locked(session, rec, now)
                session.commit()
                raise BizError(ErrorCode.RECRUITMENT_CLOSED, "招募已截止")

            app = session.execute(
                select(Application)
                .where(Application.id == application_id)
                .with_for_update()
            ).scalar_one()
            if app.status != "accepted":
                raise BizError(ErrorCode.CONFLICT, "当前状态不可撤销")

            app.status = "not_passed"
            app.reason = "offer_revoked"
            app.decided_at = now
            session.add(
                ApplicationHistory(
                    application_id=app.id,
                    from_status="accepted",
                    to_status="not_passed",
                    reason="offer_revoked",
                    operator_id=operator.id,
                )
            )
            result = self._serialize_app(session, app)
            session.commit()
            return result
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    # ---------- 查询 ----------

    def list_mine(
        self, applicant_id: int, page: int | None = None, page_size: int | None = None
    ) -> dict:
        with SessionLocal() as session:
            stmt = (
                select(Application)
                .where(Application.applicant_id == applicant_id)
                .order_by(Application.created_at.desc(), Application.id.desc())
            )
            result = paginate(session, stmt, page, page_size)
            result["items"] = [
                self._serialize_app(session, a) for a in result["items"]
            ]
            return result

    def list_for_recruitment(
        self,
        operator: User,
        recruitment_id: int,
        page: int | None = None,
        page_size: int | None = None,
    ) -> dict:
        with SessionLocal() as session:
            rec = session.get(Recruitment, recruitment_id)
            if rec is None:
                raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
            if rec.owner_id != operator.id:
                raise BizError(ErrorCode.FORBIDDEN, "仅发布者可查看")

            stmt = (
                select(Application)
                .where(Application.recruitment_id == recruitment_id)
                .order_by(Application.created_at.asc(), Application.id.asc())
            )
            result = paginate(session, stmt, page, page_size)
            result["items"] = [
                self._serialize_app(session, a) for a in result["items"]
            ]
            return result
