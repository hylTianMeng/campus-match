"""认证与资料请求/响应 Schema。"""
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    nickname: str = Field(min_length=1, max_length=50)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdateRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=50)
    department: str | None = Field(default=None, max_length=100)
    grade: str | None = Field(default=None, max_length=32)
    bio: str | None = Field(default=None, max_length=500)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: str
    nickname: str
    avatar_url: str | None = None
    department: str | None = None
    grade: str | None = None
    bio: str | None = None
    is_verified: bool
    status: str
    created_at: str | None = None


class AuthResult(TokenPair):
    user: UserOut
