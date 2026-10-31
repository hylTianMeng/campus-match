"""统一鉴权（PermissionGuard）与资源归属校验。

- FastAPI 依赖：get_current_user / get_current_user_optional / require_verified
- 资源关系函数：require_recruitment_owner / require_application_applicant /
  require_conversation_member，供 service 层在事务内复用
"""
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.exceptions import BizError, ErrorCode
from app.core.security import decode_token
from app.models import Application, Conversation, Recruitment, User

bearer_scheme = HTTPBearer(auto_error=False)


def get_db():
    """FastAPI 依赖：提供数据库会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """解析 Bearer access token，返回当前用户（未登录/失效抛 HTTP 401）。"""
    if credentials is None:
        raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)

    payload = decode_token(credentials.credentials, expected_type="access")
    user = db.get(User, int(payload["sub"]))
    if user is None or user.status == "deleted":
        raise BizError(ErrorCode.UNAUTHORIZED, "未登录", 401)
    if user.token_version != payload.get("ver"):
        raise BizError(ErrorCode.TOKEN_EXPIRED, "登录态失效", 401)
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """公开接口用的可选鉴权：有合法 token 返回用户，否则返回 None。"""
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except BizError:
        return None
    user = db.get(User, int(payload["sub"]))
    if user is None or user.status == "deleted":
        return None
    if user.token_version != payload.get("ver"):
        return None
    return user


def require_verified(user: User = Depends(get_current_user)) -> User:
    """已验证守卫（MVP 注册即认证，保留守卫代码，未来接入验证码零改动）。"""
    if not user.is_verified:
        raise BizError(ErrorCode.NOT_VERIFIED, "未完成校园认证")
    return user


def require_recruitment_owner(db: Session, user: User, recruitment_id: int) -> Recruitment:
    """校验资源存在且属于当前用户，返回招募行。"""
    rec = db.get(Recruitment, recruitment_id)
    if rec is None:
        raise BizError(ErrorCode.NOT_FOUND, "招募不存在")
    if rec.owner_id != user.id:
        raise BizError(ErrorCode.FORBIDDEN, "仅发布者可操作")
    return rec


def require_application_applicant(
    db: Session, user: User, application_id: int
) -> Application:
    """校验申请存在且申请者为当前用户，返回申请行。"""
    app = db.get(Application, application_id)
    if app is None:
        raise BizError(ErrorCode.NOT_FOUND, "申请不存在")
    if app.applicant_id != user.id:
        raise BizError(ErrorCode.FORBIDDEN, "仅申请者可操作")
    return app


def require_conversation_member(
    db: Session, user: User, conversation_id: int
) -> Conversation:
    """校验会话存在且当前用户为成员，返回会话行。"""
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise BizError(ErrorCode.NOT_FOUND, "会话不存在")
    if user.id not in (conv.user_a_id, conv.user_b_id):
        raise BizError(ErrorCode.FORBIDDEN, "非会话成员")
    return conv
