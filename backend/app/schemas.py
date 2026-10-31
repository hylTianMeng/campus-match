from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
from pydantic import BaseModel, Field, ConfigDict, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class Profile(Input):
    name: str = Field(min_length=1, max_length=40)
    dept: str = Field(default="", max_length=80)
    year: str = Field(default="", max_length=40)
    bio: str = Field(default="", max_length=2000)
    tags: List[str] = Field(default_factory=list, max_length=20)
    searchable: bool = True
    public_posts: bool = True
    public_teams: bool = False

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, values):
        if any(not v.strip() or len(v) > 40 for v in values):
            raise ValueError("标签长度为 1–40 个字符")
        return list(dict.fromkeys(v.strip() for v in values))


class Role(Input):
    name: str = Field(min_length=1, max_length=80)
    capacity: int = Field(ge=1, le=100)
    description: str = Field(default="", max_length=2000)
    tags: List[str] = Field(default_factory=list, max_length=20)


class Extras(Input):
    contact: str = Field(default="", max_length=300)
    eventIntro: str = Field(default="", max_length=5000)
    mentor: str = Field(default="", max_length=2000)
    outcome: str = Field(default="", max_length=2000)
    activityLink: str = Field(default="", max_length=2000)
    attachmentInfo: str = Field(default="", max_length=2000)
    attachmentLink: str = Field(default="", max_length=2000)

    @field_validator("activityLink", "attachmentLink")
    @classmethod
    def safe_url(cls, value):
        if value and (
            urlparse(value).scheme not in ("http", "https")
            or not urlparse(value).netloc
        ):
            raise ValueError("链接仅支持完整的 http / https 地址")
        return value


class PostEdit(Input):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=20000)
    place: str = Field(default="", max_length=200)
    tags: List[str] = Field(default_factory=list, max_length=20)
    extras: Extras = Field(default_factory=Extras)


class PostCreate(PostEdit):
    category: str = Field(min_length=1, max_length=40)
    deadline: datetime
    event_time: str = Field(default="", max_length=80)
    roles: List[Role] = Field(min_length=1, max_length=20)
    draft_id: Optional[int] = None

    @field_validator("deadline")
    @classmethod
    def future_deadline(cls, value):
        if value.tzinfo is None:
            raise ValueError("截止时间必须包含时区")
        value = value.astimezone(timezone.utc)
        if value <= datetime.now(timezone.utc):
            raise ValueError("截止时间必须晚于当前时间")
        return value


class ApplicationCreate(Input):
    role_id: int
    message: str = Field(default="", max_length=2000)
    experience: str = Field(default="", max_length=3000)
    portfolio: str = Field(default="", max_length=2000)

    @field_validator("portfolio")
    @classmethod
    def safe_url(cls, value):
        return Extras.safe_url(value)


class Decision(Input):
    action: str = Field(pattern="^(accept|reject|revoke|withdraw|give-up)$")
    reason: str = Field(default="", max_length=1000)


class Draft(Input):
    payload: Dict[str, Any]


class Message(Input):
    body: str = Field(min_length=1, max_length=4000)
