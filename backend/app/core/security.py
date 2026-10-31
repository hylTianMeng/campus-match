"""密码哈希与 JWT 编解码。"""
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import BizError, ErrorCode

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """使用 bcrypt 生成密码哈希。"""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """校验明文密码与哈希是否匹配。"""
    try:
        return pwd_context.verify(plain, hashed)
    except ValueError:
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _encode(payload: dict) -> str:
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def create_access_token(user_id: int, token_version: int) -> str:
    """签发 access token（30 分钟）。"""
    now = _now()
    return _encode(
        {
            "sub": str(user_id),
            "ver": token_version,
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        }
    )


def create_refresh_token(user_id: int, token_version: int) -> str:
    """签发 refresh token（14 天）。"""
    now = _now()
    return _encode(
        {
            "sub": str(user_id),
            "ver": token_version,
            "type": "refresh",
            "iat": now,
            "exp": now + timedelta(days=settings.refresh_token_expire_days),
        }
    )


def decode_token(token: str, expected_type: str | None = None) -> dict:
    """解码并校验 JWT，返回 payload。

    Raises:
        BizError: 过期返回 40101，非法/类型不符返回 40100（均为 HTTP 401）。
    """
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.ExpiredSignatureError:
        raise BizError(ErrorCode.TOKEN_EXPIRED, "登录态失效", 401)
    except jwt.InvalidTokenError:
        raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)

    if expected_type and payload.get("type") != expected_type:
        raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)
    return payload
