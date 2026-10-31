"""认证与资料服务。"""
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.exceptions import BizError, ErrorCode
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import User
from app.schemas.auth import ProfileUpdateRequest
from app.utils import iso


class AuthService:
    """账号与会话：注册 / 登录 / 刷新 / 登出 / 我的资料 / 编辑资料。"""

    @staticmethod
    def _normalize_email(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _check_domain(email: str) -> None:
        for domain in settings.allowed_email_domain_list:
            if email.endswith(domain):
                return
        raise BizError(ErrorCode.INVALID_PARAM, "仅支持校园邮箱注册")

    @staticmethod
    def _issue_tokens(user: User) -> dict:
        return {
            "access_token": create_access_token(user.id, user.token_version),
            "refresh_token": create_refresh_token(user.id, user.token_version),
        }

    @staticmethod
    def _serialize_user(user: User) -> dict:
        return {
            "id": user.id,
            "email": user.email,
            "nickname": user.nickname,
            "avatar_url": user.avatar_url,
            "department": user.department,
            "grade": user.grade,
            "bio": user.bio,
            "is_verified": bool(user.is_verified),
            "status": user.status,
            "created_at": iso(user.created_at),
        }

    def register(self, email: str, password: str, nickname: str) -> dict:
        email = self._normalize_email(email)
        self._check_domain(email)

        with SessionLocal() as session:
            with session.begin():
                exists = session.execute(
                    select(User).where(User.email == email)
                ).scalar_one_or_none()
                if exists is not None:
                    raise BizError(ErrorCode.CONFLICT, "该邮箱已注册")

                user = User(
                    email=email,
                    password_hash=hash_password(password),
                    nickname=nickname.strip(),
                    is_verified=True,  # MVP 注册即认证
                )
                session.add(user)
                session.flush()
                return {
                    **self._issue_tokens(user),
                    "user": self._serialize_user(user),
                }

    def login(self, email: str, password: str) -> dict:
        email = self._normalize_email(email)

        with SessionLocal() as session:
            user = session.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if (
                user is None
                or user.status == "deleted"
                or not verify_password(password, user.password_hash)
            ):
                raise BizError(ErrorCode.INVALID_PARAM, "邮箱或密码错误")
            return {
                **self._issue_tokens(user),
                "user": self._serialize_user(user),
            }

    def refresh(self, refresh_token: str) -> dict:
        payload = decode_token(refresh_token, expected_type="refresh")
        user_id = int(payload["sub"])

        with SessionLocal() as session:
            user = session.get(User, user_id)
            if user is None or user.status == "deleted":
                raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)
            if user.token_version != payload.get("ver"):
                raise BizError(ErrorCode.TOKEN_EXPIRED, "登录态失效", 401)
            return self._issue_tokens(user)

    def logout(self, user_id: int) -> None:
        with SessionLocal() as session:
            with session.begin():
                user = session.get(User, user_id)
                if user is not None:
                    user.token_version += 1

    def get_me(self, user_id: int) -> dict:
        with SessionLocal() as session:
            user = session.get(User, user_id)
            if user is None or user.status == "deleted":
                raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)
            return self._serialize_user(user)

    def update_profile(self, user_id: int, payload: ProfileUpdateRequest) -> dict:
        with SessionLocal() as session:
            with session.begin():
                user = session.get(User, user_id)
                if user is None or user.status == "deleted":
                    raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)
                user.nickname = payload.nickname.strip()
                user.department = payload.department
                user.grade = payload.grade
                user.bio = payload.bio
                return self._serialize_user(user)
