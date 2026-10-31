"""申请请求/响应 Schema。"""
from pydantic import BaseModel, Field


class ApplicationSubmitRequest(BaseModel):
    """提交申请入参（留言可空）。"""

    message: str | None = Field(default=None, max_length=500)
