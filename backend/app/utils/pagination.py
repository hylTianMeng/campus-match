"""分页封装。

统一分页响应结构：``{"items": [...], "total": n, "page": p, "page_size": s}``。
"""
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50


def normalize_page(page: int | None, page_size: int | None) -> tuple[int, int]:
    """归一化分页参数：page>=1，1<=page_size<=50。"""
    page = max(1, page or DEFAULT_PAGE)
    page_size = max(1, min(page_size or DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
    return page, page_size


def paginate(
    session: Session,
    stmt: Select,
    page: int | None = None,
    page_size: int | None = None,
) -> dict:
    """对 Select 语句执行 count + 分页查询，返回统一分页字典。"""
    page, page_size = normalize_page(page, page_size)

    total = session.execute(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ).scalar_one()

    items = session.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()

    return {
        "items": list(items),
        "total": int(total),
        "page": page,
        "page_size": page_size,
    }
