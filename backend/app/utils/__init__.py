"""通用工具函数。"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    """返回当前 UTC 时间（naive）。

    MySQL ``DATETIME(3)`` 不携带时区，统一以 naive UTC 存储与比较，
    避免与数据库中读出的 naive datetime 比较时报 ``can't compare``。
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    """将 datetime 序列化为带毫秒、以 ``Z`` 结尾的 UTC ISO 字符串。"""
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def ensure_naive_utc(dt: datetime | None) -> datetime | None:
    """将 datetime 统一为 naive UTC（前端 datetime-local 传入 naive 直接返回）。"""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt
