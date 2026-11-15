from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Literal
from urllib.parse import urlparse
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class Register(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(min_length=1, max_length=40)


class VerifyCode(Input):
    code: str = Field(pattern=r"^\d{6}$")


class ResetRequest(Input):
    email: str = Field(min_length=3, max_length=254)


class ResetPassword(Input):
    email: str = Field(min_length=3, max_length=254)
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=8, max_length=200)


class DeleteAccount(Input):
    password: str = Field(min_length=1, max_length=200)


class BanUser(Input):
    reason: str = Field(min_length=1, max_length=1000)


class UnbanUser(Input):
    reason: str = Field(default="", max_length=1000)


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
    accepting: bool = True


class RoleEdit(Role):
    id: Optional[int] = None


class InformationItem(Input):
    title: str = Field(min_length=1, max_length=100)
    type: Literal["text", "link", "attachment"]
    content: str = Field(default="", max_length=5000)
    attachment_id: Optional[int] = None

    @model_validator(mode="after")
    def validate_content(self):
        if self.type == "attachment":
            if self.attachment_id is None or self.content:
                raise ValueError("附件信息须上传文件")
        else:
            if not self.content or self.attachment_id is not None:
                raise ValueError("请填写信息内容")
            if self.type == "link":
                parsed = urlparse(self.content)
                if parsed.scheme not in ("http", "https") or not parsed.netloc:
                    raise ValueError("链接仅支持完整的 http / https 地址")
        return self


class Extras(Input):
    items: List[InformationItem] = Field(default_factory=list, max_length=20)
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
    category: Optional[str] = Field(default=None, min_length=1, max_length=40)
    deadline: Optional[datetime] = None
    event_time: Optional[str] = Field(default=None, max_length=80)
    roles: Optional[List[RoleEdit]] = Field(default=None, max_length=20)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=20000)
    place: str = Field(default="", max_length=200)
    tags: List[str] = Field(default_factory=list, max_length=20)
    extras: Extras = Field(default_factory=Extras)
    attachment_id: Optional[int] = None

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, values):
        if any(not value.strip() or len(value.strip()) > 40 for value in values):
            raise ValueError("招募标签长度须为 1–40 个字符")
        return list(dict.fromkeys(value.strip() for value in values))


class PostCreate(PostEdit):
    category: str = Field(min_length=1, max_length=40)
    deadline: datetime
    event_time: str = Field(default="", max_length=80)
    roles: List[Role] = Field(max_length=20)
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
    allow_reapply: bool = True


class ApplicationBan(Input):
    user_id: int
    banned: bool


class Draft(Input):
    payload: Dict[str, Any]


class AttachmentUpload(Input):
    filename: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=1, max_length=7000000)


class Message(Input):
    body: str = Field(min_length=1, max_length=4000)
