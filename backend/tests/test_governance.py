"""Integration coverage for private data, moderation, retries, and legacy databases."""

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.db import connect, init_db, now, notify
from conftest import login
from test_api import new_post, apply


def send(client, peer_id, text="hello", key="request-1"):
    response = client.post(
        f"/api/messages/{peer_id}", json={"body": text, "client_id": key}
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_personal_deletion_hiding_and_idempotent_send(client):
    login(client, "chen")
    message_id = send(client, 1)
    assert send(client, 1) == message_id
    assert (
        client.post(
            "/api/messages/1", json={"body": "changed", "client_id": "request-1"}
        ).status_code
        == 409
    )
    login(client, "lin")
    assert client.get("/api/unread").json()["messages"] == 1
    assert client.delete(f"/api/messages/{message_id}").status_code == 200
    assert client.get("/api/messages/2").json() == []
    assert client.get("/api/unread").json()["messages"] == 0
    login(client, "chen")
    assert client.get("/api/messages/1").json()[0]["body"] == "hello"
    send(client, 1, "next", "request-2")
    login(client, "lin")
    assert client.post("/api/conversations/2/hide", json={}).status_code == 200
    assert client.get("/api/conversations").json() == []
    assert client.get("/api/unread").json()["messages"] == 0
    login(client, "chen")
    assert client.get("/api/conversations").json()
    send(client, 1, "new after hide", "request-3")
    login(client, "lin")
    assert (
        client.get("/api/conversations").json()[0]["last"]["body"] == "new after hide"
    )
    assert client.get("/api/unread").json()["messages"] == 1
    login(client, "shen")
    assert client.delete(f"/api/messages/{message_id}").status_code == 404
    assert client.get("/api/messages/2").json() == []


def test_block_direction_cascades_multiple_posts_and_preserves_acceptance(client):
    login(client, "chen")
    first, second = new_post(client, (2,)), new_post(client, (2,))
    login(client)
    app_a, app_b = apply(client, first), apply(client, second)
    login(client, "chen")
    assert (
        client.post(
            f"/api/applications/{app_a}/decision", json={"action": "accept"}
        ).status_code
        == 200
    )
    assert client.put("/api/blocks/1", json={}).status_code == 200
    assert client.put("/api/blocks/1", json={}).status_code == 200
    apps = {
        r["id"]: r for r in client.get(f"/api/posts/{second['id']}/applications").json()
    }
    assert apps[app_b]["status"] == "rejected"
    assert client.get("/api/blocks").json()[0]["id"] == 1
    send(client, 1, "outgoing remains allowed")
    login(client)
    assert client.post("/api/messages/2", json={"body": "blocked"}).status_code == 403
    assert (
        client.post(
            f"/api/posts/{second['id']}/applications",
            json={"role_id": second["roles"][0]["id"]},
        ).status_code
        == 403
    )
    mine = {a["id"]: a for a in client.get("/api/me/applications").json()}
    assert mine[app_a]["status"] == "accepted"
    assert mine[app_b]["status"] == "rejected"
    login(client, "chen")
    client.delete("/api/blocks/1")
    login(client)
    send(client, 2, "allowed again")
    assert apply(client, second) != app_b
    assert (
        len(
            [
                n
                for n in client.get("/api/notices").json()
                if n["body"] == "当前申请无法继续，已结束审核。"
            ]
        )
        == 1
    )


def test_reports_sanitize_notifications_and_preserve_retry_state(client):
    login(client, "chen")
    post = new_post(client)
    login(client, "shen")
    body = {
        "target_type": "post",
        "target_id": post["id"],
        "reason": "private-reporter-evidence",
    }
    report = client.post("/api/reports", json=body).json()
    assert client.post("/api/reports", json=body).json()["id"] == report["id"]
    assert client.get("/api/admin/reports").status_code == 403
    assert client.get("/api/posts/" + str(post["id"])).status_code == 200
    login(client)
    decision = {"action": "take-down", "reason": "private-reporter-evidence"}
    assert (
        client.post(
            f"/api/admin/reports/{report['id']}/resolve", json=decision
        ).status_code
        == 200
    )
    count = len(client.get("/api/admin/actions").json())
    assert (
        client.post(
            f"/api/admin/reports/{report['id']}/resolve", json=decision
        ).status_code
        == 200
    )
    assert len(client.get("/api/admin/actions").json()) == count
    login(client, "chen")
    assert "private-reporter-evidence" not in client.get("/api/notices").text
    assert client.get("/api/me/reports").json() == []
    login(client, "shen")
    assert client.get("/api/me/reports").json()[0]["status"] == "resolved"


def test_independent_restrictions_expiry_and_history(client):
    login(client, "chen")
    post = new_post(client)
    login(client, "shen")
    app_id = apply(client, post)
    client.put(f"/api/posts/{post['id']}/favorite", json={})
    login(client)
    assert (
        client.post(
            f"/api/admin/posts/{post['id']}/take-down",
            json={"reason": "internal reason"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/admin/users/2/ban", json={"reason": "account issue"}
        ).status_code
        == 200
    )
    assert (
        client.post("/api/admin/users/2/ban", json={"reason": "retry"}).status_code
        == 200
    )
    assert client.post("/api/admin/users/2/unban", json={}).status_code == 200
    login(client, "shen")
    assert client.get(f"/api/posts/{post['id']}").status_code == 404
    assert client.get("/api/me/favorites").json()[0] == {
        "id": post["id"],
        "title": "内容暂不可查看",
        "unavailable": True,
    }
    assert not client.get("/api/people/2").json()["posts"] or all(
        p.get("id") != post["id"] for p in client.get("/api/people/2").json()["posts"]
    )
    assert (
        client.post(
            f"/api/applications/{app_id}/decision", json={"action": "withdraw"}
        ).status_code
        == 409
    )
    login(client, "chen")
    assert (
        client.post(
            f"/api/applications/{app_id}/decision", json={"action": "accept"}
        ).status_code
        == 409
    )
    login(client)
    assert (
        client.post(
            f"/api/admin/posts/{post['id']}/restore", json={"reason": "restored"}
        ).status_code
        == 200
    )
    login(client, "shen")
    assert client.get(f"/api/posts/{post['id']}").status_code == 200
    login(client)
    client.post(
        f"/api/admin/posts/{post['id']}/take-down", json={"reason": "another issue"}
    )
    with connect() as db:
        db.execute(
            "UPDATE posts SET deadline=? WHERE id=?",
            (
                (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                post["id"],
            ),
        )
    assert client.get("/api/admin/posts").json()[0]["status"] == "ended"
    assert (
        client.post(
            f"/api/admin/posts/{post['id']}/restore", json={"reason": "late"}
        ).status_code
        == 409
    )
    login(client, "shen")
    assert {a["id"]: a for a in client.get("/api/me/applications").json()}[app_id][
        "status"
    ] == "expired"
    assert "internal reason" not in client.get("/api/notices").text


def test_message_audit_gate_hidden_evidence_and_append_only(client):
    login(client, "chen")
    message_id = send(client, 3, "sensitive-private-content")
    login(client, "shen")
    report_id = client.post(
        "/api/reports",
        json={
            "target_type": "message",
            "target_id": message_id,
            "reason": "quoted sensitive-private-content",
        },
    ).json()["id"]
    assert client.get("/api/admin/conversations").status_code == 403
    assert client.delete(f"/api/messages/{message_id}").status_code == 200
    client.post("/api/conversations/2/hide", json={})
    login(client)
    assert (
        "sensitive-private-content" not in client.get("/api/admin/conversations").text
    )
    assert "sensitive-private-content" not in client.get("/api/admin/reports").text
    assert (
        client.post(
            "/api/admin/conversations/access",
            json={"first_user_id": 2, "second_user_id": 3, "reason": " "},
        ).status_code
        == 422
    )
    assert client.get("/api/admin/conversations/access/1").status_code == 403
    result = client.post(
        "/api/admin/conversations/access",
        json={"first_user_id": 2, "second_user_id": 3, "reason": "investigate"},
    ).json()
    assert result["messages"][0]["body"] == "sensitive-private-content"
    audit_id = result["audit"]["id"]
    assert (
        client.get(
            f"/api/admin/reports/{report_id}/evidence", params={"audit_id": audit_id}
        ).json()["reason"]
        == "quoted sensitive-private-content"
    )
    assert (
        client.get(f"/api/admin/conversations/access/{audit_id}").json()[0]["id"]
        == message_id
    )
    with connect() as db:
        for statement in [
            "UPDATE message_access_audits SET reason='edited'",
            "DELETE FROM message_access_audits",
        ]:
            try:
                db.execute(statement)
                raise AssertionError("audit mutated")
            except sqlite3.IntegrityError:
                pass
    login(client, "chen")
    assert client.get(f"/api/admin/conversations/access/{audit_id}").status_code == 403
    assert client.get("/api/me/reports").json() == []


def test_failed_audit_never_returns_private_content(client):
    login(client, "chen")
    send(client, 3, "never-return-this")
    with connect() as db:
        db.execute(
            "CREATE TRIGGER fail_access BEFORE INSERT ON message_access_audits BEGIN SELECT RAISE(ABORT,'test failure'); END"
        )
    login(client)
    with TestClient(app, raise_server_exceptions=False) as other:
        other.cookies.update(client.cookies)
        result = other.post(
            "/api/admin/conversations/access",
            json={"first_user_id": 2, "second_user_id": 3, "reason": "investigate"},
        )
        assert result.status_code == 500
        assert "never-return-this" not in result.text
    assert client.get("/api/admin/message-audits").json() == []


def test_concurrent_report_resolution_and_message_retry(client):
    login(client, "chen")
    cookie = client.cookies.get("campus_session")

    def concurrent_send(_):
        with TestClient(app) as other:
            other.cookies.set("campus_session", cookie)
            return send(other, 3, "one copy", "same-key")

    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(concurrent_send, range(2)))
    assert len(set(ids)) == 1
    login(client, "shen")
    report_id = client.post(
        "/api/reports", json={"target_type": "user", "target_id": 2, "reason": "issue"}
    ).json()["id"]
    login(client)
    cookie = client.cookies.get("campus_session")

    def resolve(_):
        with TestClient(app) as other:
            other.cookies.set("campus_session", cookie)
            return other.post(
                f"/api/admin/reports/{report_id}/resolve",
                json={"action": "ban", "reason": "confirmed"},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(resolve, range(2))) == [200, 200]
    assert len(client.get("/api/admin/actions").json()) == 1
    assert client.post("/api/admin/users/1/unban", json={}).status_code == 200
    login(client, "chen")
    assert (
        len([n for n in client.get("/api/notices").json() if n["kind"] == "moderation"])
        == 1
    )


def test_legacy_migration_and_notification_transaction(client):
    login(client)
    init_db()
    init_db()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        notify(
            db, 1, "once", event_key="one-event", kind="report", target_path="/reports"
        )
        notify(
            db, 1, "once", event_key="one-event", kind="report", target_path="/reports"
        )
        db.commit()
        assert (
            db.execute(
                "SELECT count(*) FROM notices WHERE event_key='one-event'"
            ).fetchone()[0]
            == 1
        )
        db.execute("BEGIN IMMEDIATE")
        notify(db, 1, "rolled back", event_key="failed")
        db.rollback()
        assert (
            db.execute("SELECT 1 FROM notices WHERE event_key='failed'").fetchone()
            is None
        )
    notice_id = client.get("/api/notices").json()[0]["id"]
    assert client.post(f"/api/notices/{notice_id}/read", json={}).status_code == 200
    login(client, "shen")
    assert client.post(f"/api/notices/{notice_id}/read", json={}).status_code == 404


def test_real_legacy_schema_migration_preserves_records(tmp_path, monkeypatch):
    from pathlib import Path

    path = tmp_path / "legacy.sqlite3"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    with sqlite3.connect(path) as db:
        db.executescript((Path(__file__).parents[1] / "app/schema.sql").read_text())
        db.execute(
            "INSERT INTO users(id,email,password_hash,name) VALUES(1,'legacy@example.test','hash','历史用户')"
        )
        db.execute(
            "INSERT INTO users(id,email,password_hash,name) VALUES(2,'peer@example.test','hash','历史同学')"
        )
        db.execute(
            "INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(1,2,'历史私信',?)",
            (now(),),
        )
        db.execute(
            "INSERT INTO notices(user_id,body,created_at) VALUES(1,'历史通知',?)",
            (now(),),
        )
    init_db()
    init_db()
    with connect() as db:
        assert db.execute("SELECT body FROM messages").fetchone()[0] == "历史私信"
        assert db.execute("SELECT body FROM notices").fetchone()[0] == "历史通知"
        assert "client_id" in [
            r["name"] for r in db.execute("PRAGMA table_info(messages)")
        ]
        assert "taken_down" in [
            r["name"] for r in db.execute("PRAGMA table_info(posts)")
        ]
        assert (
            db.execute("SELECT count(*) FROM message_access_audits").fetchone()[0] == 0
        )


def test_audit_pagination_expiry_and_cross_conversation_evidence(client):
    with connect() as db:
        db.executemany(
            "INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(2,3,?,?)",
            [(f"item-{i}", now()) for i in range(205)],
        )
    login(client)
    opened = client.post(
        "/api/admin/conversations/access",
        json={"first_user_id": 3, "second_user_id": 2, "reason": "pagination"},
    ).json()
    assert len(opened["messages"]) == 200
    rest = client.get(
        f"/api/admin/conversations/access/{opened['audit']['id']}",
        params={"after": opened["messages"][-1]["id"]},
    ).json()
    assert len(rest) == 5
    login(client, "chen")
    other_message = send(client, 4, "other-pair")
    login(client, "zhou")
    report_id = client.post(
        "/api/reports",
        json={
            "target_type": "message",
            "target_id": other_message,
            "reason": "private",
        },
    ).json()["id"]
    login(client)
    assert (
        client.get(
            f"/api/admin/reports/{report_id}/evidence",
            params={"audit_id": opened["audit"]["id"]},
        ).status_code
        == 403
    )
    with connect() as db:
        expired_id = db.execute(
            "INSERT INTO message_access_audits(admin_id,first_user_id,second_user_id,reason,created_at,expires_at) VALUES(1,2,3,?,?,?)",
            (
                "expired",
                now(),
                (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
            ),
        ).lastrowid
    assert (
        client.get(f"/api/admin/conversations/access/{expired_id}").status_code == 403
    )


def test_notice_failure_rolls_back_blacklist_and_can_retry(client):
    login(client, "chen")
    post = new_post(client)
    login(client, "shen")
    app_id = apply(client, post)
    login(client, "chen")
    with connect() as db:
        db.execute(
            "CREATE TRIGGER fail_notice BEFORE INSERT ON notices BEGIN SELECT RAISE(ABORT,'temporary notice failure'); END"
        )
    with TestClient(app, raise_server_exceptions=False) as other:
        other.cookies.update(client.cookies)
        assert other.put("/api/blocks/3", json={}).status_code == 500
    assert client.get("/api/blocks").json() == []
    apps = {
        a["id"]: a for a in client.get(f"/api/posts/{post['id']}/applications").json()
    }
    assert apps[app_id]["status"] == "pending"
    with connect() as db:
        db.execute("DROP TRIGGER fail_notice")
    assert client.put("/api/blocks/3", json={}).status_code == 200
    apps = {
        a["id"]: a for a in client.get(f"/api/posts/{post['id']}/applications").json()
    }
    assert apps[app_id]["status"] == "rejected"


def test_expired_history_survives_ban_and_deleted_users_cannot_receive(client):
    login(client, "chen")
    post = new_post(client)
    login(client, "shen")
    client.put(f"/api/posts/{post['id']}/favorite", json={})
    with connect() as db:
        db.execute(
            "UPDATE posts SET deadline=? WHERE id=?",
            (
                (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                post["id"],
            ),
        )
    client.get("/api/posts")
    login(client)
    client.post("/api/admin/users/2/ban", json={"reason": "test"})
    login(client, "shen")
    assert client.get(f"/api/posts/{post['id']}").status_code == 200
    assert client.get("/api/me/favorites").json()[0]["title"] == post["title"]
    login(client, "chen")
    client.post("/api/auth/delete", json={"password": "test-password"})
    login(client, "shen")
    assert (
        client.post("/api/messages/2", json={"body": "unavailable"}).status_code == 404
    )
    assert client.get("/api/conversations/2").json()["can_message"] is False
    assert client.get("/api/me/favorites").json()[0]["unavailable"] is True


def test_stale_identity_is_rechecked_after_moderation(client):
    from app.auth import current_user

    login(client, "chen")
    with connect() as db:
        stale = db.execute("SELECT * FROM users WHERE id=2").fetchone()
        db.execute("UPDATE users SET banned=1 WHERE id=2")
    app.dependency_overrides[current_user] = lambda: stale
    try:
        assert (
            client.post("/api/messages/3", json={"body": "must be blocked"}).status_code
            == 403
        )
        assert client.put("/api/blocks/3", json={}).status_code == 403
    finally:
        app.dependency_overrides.clear()
    login(client)
    with connect() as db:
        stale = db.execute("SELECT * FROM users WHERE id=1").fetchone()
        db.execute("UPDATE users SET is_admin=0 WHERE id=1")
    app.dependency_overrides[current_user] = lambda: stale
    try:
        assert (
            client.post(
                "/api/admin/conversations/access",
                json={"first_user_id": 2, "second_user_id": 3, "reason": "stale role"},
            ).status_code
            == 403
        )
    finally:
        app.dependency_overrides.clear()
