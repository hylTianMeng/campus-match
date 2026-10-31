"""pytest 测试夹具。

测试使用独立的 MySQL 测试库（TEST_DATABASE_URL，默认 campus_crew_test），
每次会话先 drop_all + create_all，避免污染开发库。若 MySQL 不可用则自动跳过。
"""
import os

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "mysql+pymysql://root:password@localhost:3306/campus_crew_test?charset=utf8mb4",
)
# 强制测试进程使用测试库，避免误用开发库
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["ENABLE_SCHEDULER"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
# 注意：不能用 `import app.models`——它会将本模块命名空间里的 `app` 从
# FastAPI 实例重绑定为 `app` 包（module），导致 `TestClient(app)` 抛
# TypeError: 'module' object is not callable。
# `from app.models import User` 已触发 app/models/__init__.py 导入全部模型并注册到 Base.metadata，
# 故无需再显式 `import app.models`。


def _mysql_available() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    if not _mysql_available():
        pytest.skip("MySQL 测试库不可用，跳过数据库相关测试")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


def make_user(email: str, nickname: str = "用户") -> int:
    """直接在测试库创建用户，返回 user_id。"""
    with SessionLocal() as session:
        with session.begin():
            user = User(
                email=email,
                password_hash=hash_password("password123"),
                nickname=nickname,
                is_verified=True,
            )
            session.add(user)
            session.flush()
            return user.id


def get_user(user_id: int) -> User:
    with SessionLocal() as session:
        return session.get(User, user_id)


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def user_factory():
    return make_user
