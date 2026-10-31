"""API v1 路由汇总。

所有 endpoint 统一挂载在 /api/v1 前缀下（由 main.py 设置）。
"""
from fastapi import APIRouter

from app.api.v1.endpoints import applications, auth, messages, recruitments

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    recruitments.router, prefix="/recruitments", tags=["recruitments"]
)
api_router.include_router(
    applications.router, prefix="/applications", tags=["applications"]
)
api_router.include_router(messages.router, tags=["messages"])
