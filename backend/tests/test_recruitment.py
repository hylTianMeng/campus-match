"""招募生命周期测试：草稿/发布/编辑/条件删除/手动结束/岗位增删。"""
from datetime import timedelta

import pytest

from app.core.exceptions import BizError, ErrorCode
from app.schemas.recruitment import (
    PositionCreateRequest,
    PositionIn,
    RecruitmentCreateRequest,
    RecruitmentUpdateRequest,
)
from app.services.recruitment_service import RecruitmentService
from app.utils import utcnow
from tests.conftest import get_user, make_user


def _payload(**kw) -> RecruitmentCreateRequest:
    base = dict(
        title="组队做项目",
        description="需要前端和产品",
        deadline_at=utcnow() + timedelta(days=3),
        positions=[PositionIn(name="前端", capacity=2)],
        tags=["前端", "react"],
    )
    base.update(kw)
    return RecruitmentCreateRequest(**base)


def test_create_draft_then_publish(user_factory):
    owner = get_user(user_factory("owner-rec1@stu.example.edu", "O1"))
    svc = RecruitmentService()

    rec = svc.create(owner, _payload(status="draft"))
    assert rec["status"] == "draft"
    assert len(rec["positions"]) == 1
    assert set(rec["tags"]) == {"前端", "react"}

    pub = svc.publish(owner, rec["id"])
    assert pub["status"] == "open"
    assert pub["published_at"] is not None


def test_create_open_rejects_past_deadline(user_factory):
    owner = get_user(user_factory("owner-rec2@stu.example.edu", "O2"))
    svc = RecruitmentService()
    with pytest.raises(BizError) as e:
        svc.create(
            owner,
            _payload(status="open", deadline_at=utcnow() - timedelta(days=1)),
        )
    assert e.value.code == ErrorCode.INVALID_PARAM


def test_publish_requires_at_least_one_position(user_factory):
    owner = get_user(user_factory("owner-rec3@stu.example.edu", "O3"))
    svc = RecruitmentService()
    rec = svc.create(
        owner,
        _payload(status="draft", positions=[PositionIn(name="前端", capacity=1)]),
    )
    pos_id = rec["positions"][0]["id"]
    svc.remove_position(owner, rec["id"], pos_id)
    with pytest.raises(BizError) as e:
        svc.publish(owner, rec["id"])
    assert e.value.code == ErrorCode.INVALID_PARAM


def test_edit_general_and_position_add_remove(user_factory):
    owner = get_user(user_factory("owner-rec4@stu.example.edu", "O4"))
    svc = RecruitmentService()
    rec = svc.create(owner, _payload(status="draft"))

    # 草稿可加岗位
    pos = svc.add_position(
        owner, rec["id"], PositionCreateRequest(name="产品", capacity=1)
    )
    assert pos["name"] == "产品"

    # 编辑标题与标签
    updated = svc.update(
        owner,
        rec["id"],
        RecruitmentUpdateRequest(title="新标题", tags=["后端"]),
    )
    assert updated["title"] == "新标题"
    assert updated["tags"] == ["后端"]

    # 至少保留一岗
    assert len(updated["positions"]) == 2
    with pytest.raises(BizError) as e:
        svc.remove_position(owner, rec["id"], rec["positions"][0]["id"])
    assert e.value.code == ErrorCode.INVALID_PARAM


def test_published_recruitment_cannot_change_deadline(user_factory):
    owner = get_user(user_factory("owner-rec5@stu.example.edu", "O5"))
    svc = RecruitmentService()
    rec = svc.create(owner, _payload(status="open"))

    with pytest.raises(BizError) as e:
        svc.update(
            owner,
            rec["id"],
            RecruitmentUpdateRequest(deadline_at=utcnow() + timedelta(days=10)),
        )
    assert e.value.code == ErrorCode.INVALID_PARAM


def test_delete_conditionally(user_factory):
    owner = get_user(user_factory("owner-rec6@stu.example.edu", "O6"))
    svc = RecruitmentService()
    rec = svc.create(owner, _payload(status="draft"))

    # 无历史申请可删除
    svc.delete_conditionally(owner, rec["id"])
    with pytest.raises(BizError) as e:
        svc.get_detail(rec["id"], owner)
    assert e.value.code == ErrorCode.NOT_FOUND


def test_end_manually(user_factory):
    owner = get_user(user_factory("owner-rec7@stu.example.edu", "O7"))
    svc = RecruitmentService()
    rec = svc.create(owner, _payload(status="open"))

    ended = svc.end_manually(owner, rec["id"])
    assert ended["status"] == "ended"
    assert ended["end_reason"] == "manual"
