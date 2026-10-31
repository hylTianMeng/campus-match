from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.db import connect, now
from conftest import login


def new_post(client, capacities=(1, 1)):
    response = client.post(
        "/api/posts",
        json={
            "title": "集成测试招募",
            "category": "课程项目",
            "description": "协作完成真实项目",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "roles": [
                {"name": "岗位" + str(i), "capacity": n}
                for i, n in enumerate(capacities)
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def apply(client, post, role=0):
    response = client.post(
        f"/api/posts/{post['id']}/applications",
        json={
            "role_id": post["roles"][role]["id"],
            "message": "private-note",
            "portfolio": "https://example.com/private-cv",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def decision(client, app_id, action="accept"):
    return client.post(
        f"/api/applications/{app_id}/decision",
        json={"action": action, "reason": "测试操作"},
    )


def test_public_search_auth_and_csrf(client):
    posts = client.get("/api/posts").json()
    assert len(posts) == 6
    assert set(posts[0]["owner"]) == {"id", "name"}
    assert len(client.get("/api/posts", params={"q": "碳足迹"}).json()) == 1
    assert client.get("/api/me/applications").status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "lin@example.test", "password": "wrong"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={}, headers={"origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert client.post("/api/auth/login", content="x=y").status_code == 415
    login(client)
    assert client.get("/api/auth/me").json()["name"] == "林知夏"
    client.post("/api/auth/logout", json={})
    assert client.get("/api/auth/me").status_code == 401


def test_multirole_acceptance_and_full_lock(client):
    login(client, "chen")
    post = new_post(client)
    login(client, "lin")
    first = apply(client, post, 0)
    other = apply(client, post, 1)
    assert (
        client.post(
            f"/api/posts/{post['id']}/applications",
            json={"role_id": post["roles"][0]["id"]},
        ).status_code
        == 409
    )
    assert client.get(f"/api/posts/{post['id']}/applications").status_code == 403
    assert "private-note" not in client.get(f"/api/posts/{post['id']}").text
    assert decision(client, first).status_code == 403
    login(client, "shen")
    competing = apply(client, post, 0)
    final = apply(client, post, 1)
    login(client, "chen")
    assert decision(client, first).status_code == 200
    apps = {
        a["id"]: a for a in client.get(f"/api/posts/{post['id']}/applications").json()
    }
    assert apps[other]["status"] == "withdrawn"
    assert apps[competing]["status"] == "rejected"
    assert decision(client, final).status_code == 200
    ended = client.get(f"/api/posts/{post['id']}").json()
    assert ended["status"] == "ended" and ended["end_reason"] == "filled"
    assert decision(client, first, "revoke").status_code == 409
    assert post["id"] not in [p["id"] for p in client.get("/api/posts").json()]
    login(client, "lin")
    assert decision(client, first, "give-up").status_code == 409
    assert client.get("/api/notices").json()


def test_drafts_ownership_edit_locks_and_reapply(client):
    login(client)
    draft = client.post("/api/drafts", json={"payload": {"title": "尚未完成"}}).json()
    login(client, "chen")
    assert client.get("/api/drafts").json() == []
    assert client.delete(f"/api/drafts/{draft['id']}").status_code == 404
    post = new_post(client, (2,))
    assert (
        client.patch(
            f"/api/posts/{post['id']}",
            json={"title": "修改", "description": "描述", "deadline": now()},
        ).status_code
        == 422
    )
    login(client)
    app_id = apply(client, post)
    assert (
        client.patch(
            f"/api/posts/{post['id']}", json={"title": "越权", "description": "描述"}
        ).status_code
        == 403
    )
    assert decision(client, app_id, "withdraw").status_code == 200
    assert apply(client, post) != app_id
    login(client, "chen")
    assert client.delete(f"/api/posts/{post['id']}").status_code == 409
    assert client.post(f"/api/posts/{post['id']}/end", json={}).status_code == 409


def test_expiry_and_favorites(client):
    login(client, "chen")
    post = new_post(client)
    login(client)
    apply(client, post)
    client.put(f"/api/posts/{post['id']}/favorite", json={})
    with connect() as db:
        db.execute(
            "UPDATE posts SET deadline=? WHERE id=?",
            (
                (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                post["id"],
            ),
        )
    assert client.get(f"/api/posts/{post['id']}").json()["end_reason"] == "expired"
    assert client.get("/api/me/applications").json()[0]["status"] == "expired"
    assert (
        client.get("/api/me/applications").json()[0]["events"][-1]["status"]
        == "expired"
    )
    assert client.get("/api/me/favorites").json()[0]["id"] == post["id"]
    assert (
        client.post(
            f"/api/posts/{post['id']}/applications",
            json={"role_id": post["roles"][0]["id"]},
        ).status_code
        == 409
    )


def test_profile_privacy_and_messages(client):
    lin = login(client)
    response = client.patch(
        "/api/auth/me",
        json={
            "name": "林知夏",
            "searchable": False,
            "public_posts": False,
            "public_teams": False,
        },
    )
    assert response.status_code == 200
    assert "password_hash" not in response.text
    assert (
        client.post("/api/messages/2", json={"body": "private-chat"}).status_code == 201
    )
    login(client, "shen")
    assert lin["id"] not in [p["id"] for p in client.get("/api/people").json()]
    profile = client.get("/api/people/1").json()
    assert profile["posts"] is None and profile["teams"] is None
    assert "email" not in profile
    assert client.get("/api/messages/2").json() == []
    login(client, "chen")
    assert client.get("/api/unread").json()["messages"] == 1
    assert client.get("/api/messages/1").json()[0]["body"] == "private-chat"
    assert "is_read" not in client.get("/api/messages/1").json()[0]
    client.post("/api/messages/1/read", json={})
    assert client.get("/api/unread").json()["messages"] == 0


def test_concurrent_last_slot_is_never_overbooked(client):
    login(client, "chen")
    post = new_post(client, (1,))
    owner_cookie = client.cookies.get("campus_session")
    login(client)
    first = apply(client, post)
    login(client, "shen")
    second = apply(client, post)

    def approve(app_id):
        with TestClient(app) as other:
            other.cookies.set("campus_session", owner_cookie)
            return decision(other, app_id).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(approve, [first, second]))
    assert sorted(statuses) == [200, 409]
    with connect() as db:
        count = db.execute(
            "SELECT count(*) FROM applications WHERE post_id=? AND status='accepted'",
            (post["id"],),
        ).fetchone()[0]
    assert count == 1


def test_banned_unverified_and_safe_links(client):
    login(client)
    with connect() as db:
        db.execute("UPDATE users SET verified=0 WHERE id=1")
    assert client.post("/api/drafts", json={"payload": {}}).status_code == 403
    with connect() as db:
        db.execute("UPDATE users SET verified=1,banned=1 WHERE id=1")
    assert client.post("/api/drafts", json={"payload": {}}).status_code == 403
    assert client.get("/api/me/applications").status_code == 200
    login(client, "chen")
    post = new_post(client)
    response = client.patch(
        f"/api/posts/{post['id']}",
        json={
            "title": "标题",
            "description": "内容",
            "extras": {"activityLink": "javascript:alert(1)"},
        },
    )
    assert response.status_code == 422
