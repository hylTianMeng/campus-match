"""招募与岗位端点。"""
from fastapi import APIRouter, Depends, Query

from app.core.deps import (
    get_current_user,
    get_current_user_optional,
    require_verified,
)
from app.core.exceptions import ok
from app.models import User
from app.schemas.application import ApplicationSubmitRequest
from app.schemas.recruitment import (
    PositionCreateRequest,
    RecruitmentCreateRequest,
    RecruitmentUpdateRequest,
)
from app.services.application_service import ApplicationService
from app.services.recruitment_service import RecruitmentService

router = APIRouter()
recruitment_service = RecruitmentService()
application_service = ApplicationService()


@router.post("")
def create_recruitment(
    body: RecruitmentCreateRequest, user: User = Depends(require_verified)
):
    """创建招募（status=draft/open，含岗位数组）。"""
    return ok(recruitment_service.create(user, body))


@router.get("")
def list_recruitments(
    q: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    status: str = Query(default="open"),
    sort: str = Query(default="latest"),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None),
):
    """大厅列表（关键词/标签筛选、排序分页）。"""
    return ok(
        recruitment_service.list(
            q=q, tag=tag, status=status, sort=sort, page=page, page_size=page_size
        )
    )


@router.get("/mine")
def my_recruitments(
    user: User = Depends(get_current_user),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None),
):
    """我的发布（含草稿）。"""
    return ok(
        recruitment_service.mine(
            user.id, status=status, page=page, page_size=page_size
        )
    )


@router.get("/{recruitment_id}")
def get_recruitment_detail(
    recruitment_id: int,
    user: User | None = Depends(get_current_user_optional),
):
    """招募详情（逐岗容量/已录数/岗位状态/我的申请/允许操作）。"""
    return ok(recruitment_service.get_detail(recruitment_id, user))


@router.put("/{recruitment_id}")
def update_recruitment(
    recruitment_id: int,
    body: RecruitmentUpdateRequest,
    user: User = Depends(get_current_user),
):
    """一般内容编辑（冻结名额/截止/岗位；截止仅草稿可改）。"""
    return ok(recruitment_service.update(user, recruitment_id, body))


@router.post("/{recruitment_id}/publish")
def publish_recruitment(
    recruitment_id: int, user: User = Depends(get_current_user)
):
    """发布草稿（完整校验）。"""
    return ok(recruitment_service.publish(user, recruitment_id))


@router.post("/{recruitment_id}/end")
def end_recruitment(recruitment_id: int, user: User = Depends(get_current_user)):
    """手动结束。"""
    return ok(recruitment_service.end_manually(user, recruitment_id))


@router.delete("/{recruitment_id}")
def delete_recruitment(
    recruitment_id: int, user: User = Depends(get_current_user)
):
    """条件删除（无任何历史申请）。"""
    recruitment_service.delete_conditionally(user, recruitment_id)
    return ok(None, "已删除")


@router.post("/{recruitment_id}/positions")
def add_position(
    recruitment_id: int,
    body: PositionCreateRequest,
    user: User = Depends(get_current_user),
):
    """新增岗位（仅草稿）。"""
    return ok(recruitment_service.add_position(user, recruitment_id, body))


@router.delete("/{recruitment_id}/positions/{position_id}")
def remove_position(
    recruitment_id: int,
    position_id: int,
    user: User = Depends(get_current_user),
):
    """删除岗位（仅草稿，至少保留一岗）。"""
    recruitment_service.remove_position(user, recruitment_id, position_id)
    return ok(None, "已删除")


@router.post("/{recruitment_id}/positions/{position_id}/applications")
def submit_application(
    recruitment_id: int,
    position_id: int,
    body: ApplicationSubmitRequest,
    user: User = Depends(require_verified),
):
    """提交申请（可选留言）。"""
    return ok(
        application_service.submit(
            user, recruitment_id, position_id, body.message
        )
    )


@router.get("/{recruitment_id}/applications")
def list_applications(
    recruitment_id: int,
    user: User = Depends(get_current_user),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None),
):
    """发布者查看申请列表。"""
    return ok(
        application_service.list_for_recruitment(
            user, recruitment_id, page=page, page_size=page_size
        )
    )
