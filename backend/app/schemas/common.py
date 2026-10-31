"""通用响应 Schema。"""
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """统一响应体 {code, message, data}。"""

    code: int = 0
    message: str = "ok"
    data: T | None = None


class PageData(BaseModel, Generic[T]):
    """统一分页 data 结构。"""

    items: list[T]
    total: int
    page: int
    page_size: int
