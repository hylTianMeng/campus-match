"""Alembic 迁移环境。

数据库 URL 从 app.core.config.settings 读取并覆盖 alembic.ini 中的占位值，
target_metadata 使用 app.models 汇总后的 Base.metadata。
"""
from logging.config import fileConfig
import os
import sys

from sqlalchemy import engine_from_config, pool

from alembic import context

# 将 backend 根目录加入 sys.path，便于导入 app 包
sys.path.insert(
    0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from app.core.config import settings  # noqa: E402
from app.core.database import Base  # noqa: E402
import app.models  # noqa: E402,F401  确保所有模型注册到 metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """离线模式：仅生成 SQL，不连接数据库。"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """在线模式：连接数据库执行迁移。"""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
