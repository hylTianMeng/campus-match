"""申请与审核端点。"""
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user, require_verified
from app.core.exceptions import ok
from app.models import User
from app.services.application_service import ApplicationService

router = APIRouter()
service = ApplicationService()


@router.get("/mine")
def my_applications(
    user: User = Depends(get_current_user),
    page: int | None = Query(default=None),
    page_size: int | None = Query(default=None),
):
    """我的申请（含状态/reason）。"""
    return ok(service.list_mine(user.id, page=page, page_size=page_size))


@router.post("/{application_id}/approve")
def approve_application(
    application_id: int, user: User = Depends(require_verified)
):
    """通过（并发联动 BR-04~07）。"""
    return ok(service.approve(user, application_id))


@router.post("/{application_id}/reject")
def reject_application(
    application_id: int, user: User = Depends(require_verified)
):
    """拒绝。"""
    return ok(service.reject(user, application_id))


@router.post("/{application_id}/withdraw")
def withdraw_application(
    application_id: int, user: User = Depends(require_verified)
):
    """撤回。"""
    return ok(service.withdraw(user, application_id))


@router.post("/{application_id}/abandon")
def abandon_application(
    application_id: int, user: User = Depends(require_verified)
):
    """放弃录取（释放名额）。"""
    return ok(service.abandon(user, application_id))


@router.post("/{application_id}/revoke")
def revoke_application(
    application_id: int, user: User = Depends(require_verified)
):
    """撤销录取（释放名额）。"""
    return ok(service.revoke_offer(user, application_id))
