"""数据库引擎、会话工厂与 ORM Base。

使用 SQLAlchemy 2.0 同步 Session（PyMySQL 驱动），FastAPI 线程池承载并发请求。
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=settings.debug,
)

# expire_on_commit=False 便于在事务提交后仍能读取对象属性用于序列化
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """所有 ORM 模型的声明式基类。"""
