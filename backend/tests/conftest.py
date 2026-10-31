import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.seed import seed


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.sqlite3"))
    monkeypatch.setenv("SEED_PASSWORD", "test-password")
    seed()
    with TestClient(app) as client:
        yield client


def login(client, name="lin"):
    response = client.post(
        "/api/auth/login",
        json={"email": name + "@example.test", "password": "test-password"},
    )
    assert response.status_code == 200, response.text
    return response.json()
