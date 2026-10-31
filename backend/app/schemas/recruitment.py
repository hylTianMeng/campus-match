"""招募/岗位请求与响应 Schema。"""
from datetime import datetime

from pydantic import BaseModel, Field


class PositionIn(BaseModel):
    """创建/新增岗位入参。"""

    name: str = Field(min_length=1, max_length=50)
    capacity: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)


class RecruitmentCreateRequest(BaseModel):
    """创建招募（草稿或直接发布）。"""

    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1)
    location: str | None = Field(default=None, max_length=100)
    activity_time: str | None = Field(default=None, max_length=100)
    deadline_at: datetime
    status: str = Field(default="draft", pattern="^(draft|open)$")
    tags: list[str] = Field(default_factory=list, max_length=20)
    positions: list[PositionIn] = Field(min_length=1, max_length=20)


class RecruitmentUpdateRequest(BaseModel):
    """一般内容编辑（截止时间仅草稿可改）。"""

    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, min_length=1)
    location: str | None = Field(default=None, max_length=100)
    activity_time: str | None = Field(default=None, max_length=100)
    deadline_at: datetime | None = None
    tags: list[str] | None = None


class PositionCreateRequest(BaseModel):
    """新增岗位入参（仅草稿）。"""

    name: str = Field(min_length=1, max_length=50)
    capacity: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)
