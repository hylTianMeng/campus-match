"""认证与资料端点。"""
from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.core.exceptions import ok
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    ProfileUpdateRequest,
    RefreshRequest,
    RegisterRequest,
)
from app.services.auth_service import AuthService

router = APIRouter()
service = AuthService()


@router.post("/register")
def register(body: RegisterRequest):
    """注册（校园邮箱域名白名单 + 注册即认证）。"""
    return ok(service.register(body.email, body.password, body.nickname))


@router.post("/login")
def login(body: LoginRequest):
    """登录，返回 access/refresh token 与用户信息。"""
    return ok(service.login(body.email, body.password))


@router.post("/refresh")
def refresh(body: RefreshRequest):
    """刷新 token。"""
    return ok(service.refresh(body.refresh_token))


@router.post("/logout")
def logout(user: User = Depends(get_current_user)):
    """登出（token_version+1 使旧 token 失效）。"""
    service.logout(user.id)
    return ok(None, "已退出登录")


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    """当前用户信息。"""
    return ok(service.get_me(user.id))


@router.put("/me/profile")
def update_profile(
    body: ProfileUpdateRequest, user: User = Depends(get_current_user)
):
    """更新资料（昵称/院系/年级/简介）。"""
    return ok(service.update_profile(user.id, body))
