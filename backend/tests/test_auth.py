"""认证与资料接口测试。"""


def test_register_login_me_logout(client):
    email = "alice1@stu.example.edu"
    payload = {"email": email, "password": "password123", "nickname": "Alice"}

    r = client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 0
    assert body["data"]["access_token"]
    assert body["data"]["user"]["email"] == email
    assert body["data"]["user"]["is_verified"] is True

    token = body["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["code"] == 0
    assert me.json()["data"]["nickname"] == "Alice"

    # 更新资料
    upd = client.put(
        "/api/v1/auth/me/profile",
        json={"nickname": "Alice2", "department": "计算机学院", "grade": "大三", "bio": "hi"},
        headers=headers,
    )
    assert upd.json()["code"] == 0
    assert upd.json()["data"]["nickname"] == "Alice2"

    # 登出后 token 失效
    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.json()["code"] == 0

    me2 = client.get("/api/v1/auth/me", headers=headers)
    assert me2.status_code == 401
    assert me2.json()["code"] in (40100, 40101)


def test_register_duplicate_email(client):
    payload = {"email": "dup1@stu.example.edu", "password": "password123", "nickname": "D"}
    assert client.post("/api/v1/auth/register", json=payload).json()["code"] == 0
    r2 = client.post("/api/v1/auth/register", json=payload)
    assert r2.json()["code"] == 40900


def test_register_reject_non_campus_email(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "outsider@gmail.com", "password": "password123", "nickname": "X"},
    )
    assert r.json()["code"] == 40000


def test_login_wrong_password(client):
    client.post(
        "/api/v1/auth/register",
        json={"email": "bob1@stu.example.edu", "password": "password123", "nickname": "B"},
    )
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "bob1@stu.example.edu", "password": "wrongpass123"},
    )
    assert r.json()["code"] == 40000


def test_unauthenticated_me_returns_401(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert r.json()["code"] == 40100
