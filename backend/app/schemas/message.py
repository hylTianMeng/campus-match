"""私信请求/响应 Schema。"""
from pydantic import BaseModel, Field


class ConversationCreateRequest(BaseModel):
    target_user_id: int


class MessageSendRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
