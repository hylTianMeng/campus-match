"""申请审核与并发联动测试（BR-04/05/06/07 核心）。"""
import threading
from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.core.exceptions import BizError
from app.models import Application, Recruitment
from app.schemas.recruitment import PositionIn, RecruitmentCreateRequest
from app.services.application_service import ApplicationService
from app.services.recruitment_service import RecruitmentService
from app.utils import utcnow
from tests.conftest import get_user, make_user
from sqlalchemy import select


def _make_open_recruitment(owner_id: int, positions: list[PositionIn]) -> dict:
    owner = get_user(owner_id)
    payload = RecruitmentCreateRequest(
        title="并发测试招募",
        description="desc",
        deadline_at=utcnow() + timedelta(days=2),
        status="open",
        positions=positions,
    )
    return RecruitmentService().create(owner, payload)


def test_submit_and_reject(user_factory):
    owner = get_user(user_factory("owner-c1@stu.example.edu", "OC1"))
    applicant = get_user(user_factory("app-c1@stu.example.edu", "AC1"))
    rec = _make_open_recruitment(owner.id, [PositionIn(name="前端", capacity=1)])
    pos_id = rec["positions"][0]["id"]

    svc = ApplicationService()
    app = svc.submit(applicant, rec["id"], pos_id, "我想加入")
    assert app["status"] == "pending"
    assert app["reason"] == "submitted"

    rejected = svc.reject(owner, app["id"])
    assert rejected["status"] == "not_passed"
    assert rejected["reason"] == "rejected"


def test_cannot_apply_own_recruitment(user_factory):
    owner = get_user(user_factory("owner-c2@stu.example.edu", "OC2"))
    rec = _make_open_recruitment(owner.id, [PositionIn(name="前端", capacity=1)])
    pos_id = rec["positions"][0]["id"]
    with pytest.raises(BizError) as e:
        ApplicationService().submit(owner, rec["id"], pos_id, None)
    assert e.value.code == 40904


def test_last_slot_concurrent_approve(user_factory):
    """并发录取最后名额：恰好一人通过，另一人被拒，招募 ended/filled。"""
    owner_id = user_factory("owner-c3@stu.example.edu", "OC3")
    a_id = user_factory("app-c3a@stu.example.edu", "A")
    b_id = user_factory("app-c3b@stu.example.edu", "B")

    rec = _make_open_recruitment(owner_id, [PositionIn(name="前端", capacity=1)])
    pos_id = rec["positions"][0]["id"]

    svc = ApplicationService()
    app_a = svc.submit(get_user(a_id), rec["id"], pos_id, None)
    app_b = svc.submit(get_user(b_id), rec["id"], pos_id, None)

    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def approve(app_id: int) -> None:
        try:
            barrier.wait(timeout=5)
            ApplicationService().approve(get_user(owner_id), app_id)
            outcomes.append("ok")
        except BizError as e:
            outcomes.append(f"err:{e.code}")
        except Exception as e:  # noqa: BLE001
            outcomes.append(f"unexpected:{type(e).__name__}")

    t1 = threading.Thread(target=approve, args=(app_a["id"],))
    t2 = threading.Thread(target=approve, args=(app_b["id"],))
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert outcomes.count("ok") == 1, outcomes
    assert len([o for o in outcomes if o.startswith("err")]) == 1

    with SessionLocal() as s:
        rec2 = s.get(Recruitment, rec["id"])
        assert rec2.status == "ended"
        assert rec2.end_reason == "filled"

        accepted = s.execute(
            select(Application).where(
                Application.recruitment_id == rec["id"],
                Application.status == "accepted",
            )
        ).scalars().all()
        assert len(accepted) == 1

        not_passed = s.execute(
            select(Application).where(
                Application.recruitment_id == rec["id"],
                Application.status == "not_passed",
                Application.reason == "capacity_full",
            )
        ).scalars().all()
        assert len(not_passed) == 1


def test_approve_auto_withdraws_other_position_before_capacity_full(user_factory):
    """BR-06 顺序敏感：先 accepted_other_position，再 capacity_full。"""
    owner_id = user_factory("owner-c4@stu.example.edu", "OC4")
    a_id = user_factory("app-c4a@stu.example.edu", "A")
    b_id = user_factory("app-c4b@stu.example.edu", "B")

    rec = _make_open_recruitment(
        owner_id,
        [
            PositionIn(name="岗位1", capacity=2),
            PositionIn(name="岗位2", capacity=1),
        ],
    )
    pos1_id = rec["positions"][0]["id"]
    pos2_id = rec["positions"][1]["id"]

    svc = ApplicationService()
    # A 同时申请岗位1和岗位2，B 申请岗位2
    app_a1 = svc.submit(get_user(a_id), rec["id"], pos1_id, None)
    app_a2 = svc.submit(get_user(a_id), rec["id"], pos2_id, None)
    app_b2 = svc.submit(get_user(b_id), rec["id"], pos2_id, None)

    # 通过 A 的岗位2 → 触发 A 岗位1自动撤回 + B 岗位2 满员拒绝
    svc.approve(get_user(owner_id), app_a2["id"])

    with SessionLocal() as s:
        a1 = s.get(Application, app_a1["id"])
        a2 = s.get(Application, app_a2["id"])
        b2 = s.get(Application, app_b2["id"])

        assert a2.status == "accepted"
        assert a1.status == "withdrawn"
        assert a1.reason == "accepted_other_position"
        assert b2.status == "not_passed"
        assert b2.reason == "capacity_full"


def test_abandon_releases_slot_and_allows_reapply(user_factory):
    owner_id = user_factory("owner-c5@stu.example.edu", "OC5")
    a_id = user_factory("app-c5a@stu.example.edu", "A")
    rec = _make_open_recruitment(owner_id, [PositionIn(name="前端", capacity=2)])
    pos_id = rec["positions"][0]["id"]

    svc = ApplicationService()
    app = svc.submit(get_user(a_id), rec["id"], pos_id, None)
    approved = svc.approve(get_user(owner_id), app["id"])
    assert approved["status"] == "accepted"

    # 未满员，可放弃释放名额
    abandoned = svc.abandon(get_user(a_id), app["id"])
    assert abandoned["status"] == "withdrawn"
    assert abandoned["reason"] == "offer_abandoned"

    # 释放后可再次申请
    again = svc.submit(get_user(a_id), rec["id"], pos_id, None)
    assert again["status"] == "pending"
