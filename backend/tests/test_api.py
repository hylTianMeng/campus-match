from concurrent.futures import ThreadPoolExecutor
import base64
import sqlite3
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.db import connect, init_db, now
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


def test_post_tags_can_be_published_edited_and_searched(client):
    login(client, "chen")
    post = client.post(
        "/api/posts",
        json={
            "title": "小标签招募",
            "category": "课程项目",
            "description": "一起做项目",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "tags": [" 零基础友好 ", "周末活动", "零基础友好"],
            "roles": [{"name": "成员", "capacity": 1}],
        },
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]
    assert post.json()["tags"] == ["零基础友好", "周末活动"]
    assert "零基础友好" in client.get("/api/post-tags").json()
    assert post_id in [p["id"] for p in client.get("/api/posts", params={"tag": "零基础友好"}).json()]
    assert post_id not in [p["id"] for p in client.get("/api/posts", params={"tag": "零基础"}).json()]
    edited = client.patch(
        f"/api/posts/{post_id}",
        json={"title": "小标签招募", "description": "一起做项目", "tags": ["设计协作"]},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["tags"] == ["设计协作"]
    assert post_id not in [p["id"] for p in client.get("/api/posts", params={"tag": "零基础友好"}).json()]
    assert post_id in [p["id"] for p in client.get("/api/posts", params={"tag": "设计协作"}).json()]


def test_post_search_prioritizes_tags_before_pagination_and_filters_category(client):
    login(client, "chen")
    categories = client.get("/api/categories").json()
    created = []
    for index, tags in enumerate([["检索标记"], ["检索标记扩展"], []]):
        response = client.post("/api/posts", json={
            "title": "检索标记" if not tags else "协作招募",
            "category": categories[index % 2],
            "description": "一起完成项目",
            "tags": tags,
            "deadline": (datetime.now(timezone.utc) + timedelta(days=4-index)).isoformat(),
            "roles": [{"name": "成员", "capacity": 1}],
        })
        assert response.status_code == 201, response.text
        created.append(response.json()["id"])
    for sort in ["latest", "deadline"]:
        results = client.get("/api/posts", params={"q": "检索标记", "sort": sort}).json()
        assert [p["id"] for p in results] == created
        first = client.get("/api/posts", params={"q": "检索标记", "sort": sort, "limit": 1}).json()
        assert first[0]["id"] == created[0]
    second = client.get("/api/posts", params={"q": "检索标记", "limit": 1, "offset": 1}).json()
    assert second[0]["id"] == created[1]
    filtered = client.get("/api/posts", params={"q": "检索标记", "category": categories[1]}).json()
    assert [p["id"] for p in filtered] == [created[1]]


def test_custom_information_and_multiple_attachments(client):
    login(client, "chen")
    uploaded = []
    for name in ["资料一.txt", "资料二.txt", "原有附件.txt"]:
        response = client.post("/api/attachments", json={
            "filename": name, "content_base64": base64.b64encode(b"public information").decode(),
        })
        assert response.status_code == 201, response.text
        uploaded.append(response.json()["id"])
    items = [
        {"title": "参与说明", "type": "text", "content": "每周讨论一次"},
        {"title": "项目主页", "type": "link", "content": "https://example.com/project"},
        *[{"title": f"资料 {index}", "type": "attachment", "attachment_id": value}
          for index, value in enumerate(uploaded[:2])],
    ]
    body = {
        "title": "自定义信息招募", "description": "协作项目", "category": "课程项目",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "roles": [{"name": "成员", "capacity": 1}],
        "extras": {"items": items}, "attachment_id": uploaded[2],
    }
    draft = client.post("/api/drafts", json={"payload": body})
    assert draft.status_code == 201
    assert client.get("/api/drafts").json()[0]["payload"]["extras"]["items"] == items
    # An uploader cannot claim another user's file.
    login(client, "lin")
    assert client.post("/api/posts", json=body).status_code == 422
    login(client, "chen")
    response = client.post("/api/posts", json=body)
    assert response.status_code == 201, response.text
    post = response.json()
    assert len(post["attachments"]) == 3
    assert post["attachment"]["id"] == uploaded[2]
    assert post["extras"]["items"][0]["title"] == "参与说明"
    for value in uploaded[:2]:
        assert client.get(f"/api/posts/{post['id']}/attachments/{value}").content == b"public information"
    other = new_post(client)
    assert client.get(f"/api/posts/{other['id']}/attachments/{uploaded[0]}").status_code == 404
    edited = {"title": body["title"], "description": body["description"], "extras": {"items": items[:3]}}
    assert client.patch(f"/api/posts/{post['id']}", json=edited).status_code == 200
    assert client.get(f"/api/posts/{post['id']}/attachments/{uploaded[1]}").status_code == 404
    assert client.get(f"/api/posts/{post['id']}/attachment").status_code == 200
    edited["extras"]["items"] = [{"title": "不安全链接", "type": "link", "content": "javascript:alert(1)"}]
    assert client.patch(f"/api/posts/{post['id']}", json=edited).status_code == 422
    edited["extras"]["items"] = [{"title": "未上传文件", "type": "attachment"}]
    assert client.patch(f"/api/posts/{post['id']}", json=edited).status_code == 422


def test_partial_post_edit_preserves_omitted_fields_and_attachments(client):
    login(client, "chen")
    upload = client.post("/api/attachments", json={
        "filename": "资料.txt", "content_base64": base64.b64encode(b"keep me").decode(),
    })
    attachment_id = upload.json()["id"]
    legacy_id = client.post("/api/attachments", json={
        "filename": "说明.txt", "content_base64": base64.b64encode(b"legacy file").decode(),
    }).json()["id"]
    post = new_post(client, (2,))
    path = f"/api/posts/{post['id']}"
    details = client.patch(path, json={
        "title": post["title"], "description": post["description"],
        "place": "图书馆", "tags": ["协作"],
        "extras": {"items": [{"title": "资料", "type": "attachment", "attachment_id": attachment_id}]},
        "attachment_id": legacy_id,
    })
    assert details.status_code == 200, details.text
    updated = client.patch(path, json={"title": post["title"], "description": "更新说明"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["place"] == "图书馆"
    assert updated.json()["tags"] == ["协作"]
    assert updated.json()["extras"] == details.json()["extras"]
    assert updated.json()["attachment"]["id"] == legacy_id
    assert client.get(f"{path}/attachments/{attachment_id}").content == b"keep me"
    assert client.get(f"{path}/attachment").content == b"legacy file"
    assert client.post(f"{path}/end", json={}).status_code == 200
    ended = client.patch(path, json={"title": post["title"], "description": "截止后更正"})
    assert ended.status_code == 200, ended.text
    assert ended.json()["place"] == "图书馆"
    assert ended.json()["tags"] == ["协作"]
    assert ended.json()["extras"] == details.json()["extras"]


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


def test_post_attachment_upload_publish_replace_and_download(client):
    login(client, "chen")
    content = b"%PDF-1.4\nattachment test\n"
    uploaded = client.post(
        "/api/attachments",
        json={"filename": "项目说明.pdf", "content_base64": base64.b64encode(content).decode()},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["id"]
    draft = client.post(
        "/api/drafts", json={"payload": {"attachment_id": attachment_id, "attachment_name": "项目说明.pdf"}}
    )
    assert draft.status_code == 201
    assert client.get("/api/drafts").json()[0]["payload"]["attachment_id"] == attachment_id
    post_data = {
        "title": "带附件的招募", "category": "课程项目", "description": "一起完成项目",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "roles": [{"name": "开发", "capacity": 1}],
        "attachment_id": attachment_id, "draft_id": draft.json()["id"],
    }
    login(client, "lin")
    denied = client.post("/api/posts", json={**post_data, "draft_id": None})
    assert denied.status_code == 422
    login(client, "chen")
    post = client.post("/api/posts", json=post_data)
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]
    assert post.json()["attachment"]["filename"] == "项目说明.pdf"
    assert client.get(f"/api/posts/{post_id}/attachment").content == content
    assert "attachment" in client.get(f"/api/posts/{post_id}/attachment").headers["content-disposition"]
    replacement = client.post(
        "/api/attachments",
        json={"filename": "新说明.txt", "content_base64": base64.b64encode("更新版".encode()).decode()},
    )
    assert replacement.status_code == 201
    edited = client.patch(
        f"/api/posts/{post_id}",
        json={"title": "带附件的招募", "description": "一起完成项目", "attachment_id": replacement.json()["id"]},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["attachment"]["filename"] == "新说明.txt"
    assert client.get(f"/api/posts/{post_id}/attachment").content == "更新版".encode()
    removed = client.patch(
        f"/api/posts/{post_id}",
        json={"title": "带附件的招募", "description": "一起完成项目", "attachment_id": None},
    )
    assert removed.status_code == 200
    assert removed.json()["attachment"] is None
    assert client.get(f"/api/posts/{post_id}/attachment").status_code == 404


def test_attachment_rejects_bad_format_and_size(client):
    login(client, "chen")
    for filename, content in [("bad.pdf", b"not a PDF"), ("bad.exe", b"run")]:
        response = client.post(
            "/api/attachments",
            json={"filename": filename, "content_base64": base64.b64encode(content).decode()},
        )
        assert response.status_code == 422
    too_large = client.post(
        "/api/attachments",
        json={"filename": "large.txt", "content_base64": base64.b64encode(b"x" * (5 * 1024 * 1024 + 1)).decode()},
    )
    assert too_large.status_code == 422


def test_public_search_auth_and_csrf(client):
    posts = client.get("/api/posts").json()
    assert len(posts) == 7
    assert set(posts[0]["owner"]) == {"id", "name", "avatar_url"}
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
    assert post["updated_at"] == post["created_at"]
    edited = client.patch(
        f"/api/posts/{post['id']}",
        json={"title": "修改", "description": "描述", "extras": {"contact": "公开邮箱@example.test"}},
    )
    assert edited.status_code == 200
    assert edited.json()["updated_at"] > post["created_at"]
    assert edited.json()["created_at"] == post["created_at"]
    assert edited.json()["extras"]["contact"] == "公开邮箱@example.test"
    assert (
        client.patch(
            f"/api/posts/{post['id']}",
            json={"title": "修改", "description": "描述", "deadline": now()},
        ).status_code
        == 409
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


def test_ended_post_cannot_be_edited(client):
    login(client, "chen")
    post = new_post(client, (2,))
    assert client.post(f"/api/posts/{post['id']}/end", json={}).status_code == 200
    assert client.patch(
        f"/api/posts/{post['id']}",
        json={"title": "结束后改写", "description": "描述"},
    ).status_code == 409
    updated = client.patch(f"/api/posts/{post['id']}", json={
        "title": post["title"], "description": "结束后补充说明", "extras": {"contact": "新联系方式"},
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "ended"
    assert updated.json()["extras"]["contact"] == "新联系方式"


def test_edit_roles_capacity_history_and_notifications(client):
    login(client, "chen")
    post = new_post(client, (3, 2))
    role_id = post["roles"][0]["id"]
    login(client, "lin")
    first = apply(client, post)
    login(client, "shen")
    second = apply(client, post)
    login(client, "chen")
    assert decision(client, first).status_code == 200
    assert decision(client, second).status_code == 200
    roles = [{key: role[key] for key in ("id", "name", "capacity", "description", "tags", "accepting")}
             for role in post["roles"]]
    body = {"title": post["title"], "description": post["description"], "roles": roles}
    roles[0]["capacity"] = 1
    assert client.patch(f"/api/posts/{post['id']}", json=body).status_code == 409
    roles[0].update(capacity=3, name="调整后的岗位", description="新职责", accepting=False)
    body.update(place="新地点", event_time=(datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                category=client.get("/api/categories").json()[-1],
                deadline=(datetime.now(timezone.utc) + timedelta(days=5)).isoformat())
    changed = client.patch(f"/api/posts/{post['id']}", json=body)
    assert changed.status_code == 200, changed.text
    assert changed.json()["roles"][0]["accepted"] == 2
    assert changed.json()["created_at"] == post["created_at"]
    login(client, "lin")
    notices = client.get("/api/notices").json()
    assert any("岗位" in n["body"] and "更新" in n["body"] for n in notices)
    assert any("安排" in n["body"] for n in notices)
    login(client, "zhou")
    assert client.post(f"/api/posts/{post['id']}/applications", json={"role_id": role_id}).status_code == 409
    login(client, "chen")
    # Removing a role with history is rejected, including after an applicant leaves.
    assert client.patch(f"/api/posts/{post['id']}", json={**body, "roles": roles[1:]}).status_code == 409
    # Remove the unused role and add another without changing existing role IDs.
    body["roles"] = [roles[0], {"name": "新岗位", "capacity": 2}]
    changed = client.patch(f"/api/posts/{post['id']}", json=body)
    assert changed.status_code == 200, changed.text
    assert changed.json()["roles"][0]["id"] == role_id
    assert changed.json()["roles"][1]["id"] != post["roles"][1]["id"]
    foreign = new_post(client)
    assert client.patch(f"/api/posts/{post['id']}", json={**body, "roles": [{"id": foreign["roles"][0]["id"], "name": "越权", "capacity": 2}]}).status_code == 422


def test_reduce_capacity_settles_pending_and_locks_filled_post(client):
    login(client, "chen")
    post = new_post(client, (3,))
    login(client, "lin")
    first = apply(client, post)
    login(client, "shen")
    second = apply(client, post)
    login(client, "chen")
    assert decision(client, first).status_code == 200
    response = client.patch(f"/api/posts/{post['id']}", json={
        "title": post["title"], "description": post["description"],
        "roles": [{"id": post["roles"][0]["id"], "name": "成员", "capacity": 1}],
    })
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ended"
    assert response.json()["end_reason"] == "filled"
    with connect() as db:
        assert db.execute("SELECT status FROM applications WHERE id=?", (second,)).fetchone()[0] == "rejected"
        assert db.execute("SELECT status FROM applications WHERE id=?", (first,)).fetchone()[0] == "accepted"
    assert client.patch(f"/api/posts/{post['id']}", json={
        "title": post["title"], "description": "新说明", "roles": [{"id": post["roles"][0]["id"], "name": "成员", "capacity": 5}],
    }).status_code == 409


def test_copy_recruitment_to_draft_preserves_source_and_copies_files(client):
    login(client, "chen")
    attachment = client.post("/api/attachments", json={"filename": "资料.txt", "content_base64": base64.b64encode(b"copy me").decode()}).json()
    post = new_post(client)
    items = [{"title": "资料", "type": "attachment", "attachment_id": attachment["id"]}]
    assert client.patch(f"/api/posts/{post['id']}", json={"title": post["title"], "description": post["description"], "extras": {"items": items}}).status_code == 200
    response = client.post(f"/api/posts/{post['id']}/copy-draft", json={})
    assert response.status_code == 201, response.text
    draft = next(d for d in client.get("/api/drafts").json() if d["id"] == response.json()["id"])["payload"]
    assert draft["deadline"] == ""
    assert "id" not in draft["roles"][0]
    assert draft["extras"]["items"][0]["attachment_id"] != attachment["id"]
    assert client.get(f"/api/posts/{post['id']}/attachments/{attachment['id']}").content == b"copy me"
    login(client, "lin")
    assert client.post(f"/api/posts/{post['id']}/copy-draft", json={}).status_code == 403


def test_existing_posts_receive_updated_at(tmp_path, monkeypatch):
    path = tmp_path / "legacy.sqlite3"
    with sqlite3.connect(path) as db:
        db.execute("CREATE TABLE posts(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)")
        db.execute("INSERT INTO posts(created_at) VALUES('2026-01-01T00:00:00+00:00')")
    monkeypatch.setenv("DATABASE_PATH", str(path))
    init_db()
    with connect() as db:
        row = db.execute("SELECT created_at,updated_at FROM posts").fetchone()
        assert row["updated_at"] == row["created_at"]


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


def test_post_without_roles_can_be_published_edited_and_rejected(client):
    login(client, "chen")
    post = client.post(
        "/api/posts",
        json={
            "title": "无岗位招募",
            "category": "课程项目",
            "description": "先收集意向，稍后补充岗位",
            "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "roles": [],
        },
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]
    assert post.json()["roles"] == []
    assert post.json()["status"] == "open"
    login(client, "shen")
    apply = client.post(f"/api/posts/{post_id}/applications", json={"role_id": 1})
    assert apply.status_code == 409
    assert "未设置岗位" in apply.json()["detail"]
    login(client, "chen")
    edited = client.patch(
        f"/api/posts/{post_id}",
        json={"title": "无岗位招募", "description": "先收集意向", "roles": []},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "open"
    added = client.patch(
        f"/api/posts/{post_id}",
        json={
            "title": "无岗位招募",
            "description": "先收集意向",
            "roles": [{"name": "成员", "capacity": 1}],
        },
    )
    assert added.status_code == 200, added.text
    assert added.json()["roles"][0]["name"] == "成员"
    assert added.json()["status"] == "open"


def test_reject_can_ban_reapply(client):
    login(client, "chen")
    post = new_post(client, (2,))
    role_id = post["roles"][0]["id"]
    login(client, "shen")
    app_id = apply(client, post)
    login(client, "chen")
    banned = client.post(
        f"/api/applications/{app_id}/decision",
        json={"action": "reject", "reason": "不合适", "allow_reapply": False},
    )
    assert banned.status_code == 200, banned.text
    login(client, "shen")
    blocked = client.post(
        f"/api/posts/{post['id']}/applications", json={"role_id": role_id}
    )
    assert blocked.status_code == 403
    assert "不允许" in blocked.json()["detail"]
    login(client, "chen")
    other = new_post(client, (1,))
    login(client, "shen")
    other_app = apply(client, other)
    login(client, "chen")
    assert decision(client, other_app, "reject").status_code == 200
    login(client, "shen")
    assert client.post(
        f"/api/posts/{other['id']}/applications",
        json={"role_id": other["roles"][0]["id"], "message": "再次尝试"},
    ).status_code == 201


def test_withdraw_ban_toggle_flow(client):
    login(client, "chen")
    post = new_post(client, (2,))
    login(client, "shen")
    app_id = apply(client, post)
    assert decision(client, app_id, "withdraw").status_code == 200
    login(client, "chen")
    apps = client.get(f"/api/posts/{post['id']}/applications").json()
    target = next(a for a in apps if a["id"] == app_id)
    assert target["status"] == "withdrawn"
    assert target["reapply_banned"] is False
    notices = client.get("/api/notices").json()
    assert any("撤回了申请" in n["body"] and target["applicant_name"] in n["body"] for n in notices)
    assert client.put(
        f"/api/posts/{post['id']}/application-ban",
        json={"user_id": target["user_id"], "banned": True},
    ).status_code == 200
    login(client, "shen")
    assert client.post(
        f"/api/posts/{post['id']}/applications",
        json={"role_id": post["roles"][0]["id"]},
    ).status_code == 403
    assert client.put(
        f"/api/posts/{post['id']}/application-ban",
        json={"user_id": target["user_id"], "banned": False},
    ).status_code == 403
    login(client, "chen")
    assert client.put(
        f"/api/posts/{post['id']}/application-ban",
        json={"user_id": target["user_id"], "banned": False},
    ).status_code == 200
    login(client, "shen")
    assert client.post(
        f"/api/posts/{post['id']}/applications",
        json={"role_id": post["roles"][0]["id"]},
    ).status_code == 201


def test_expired_post_reopens_by_extending_deadline(client):
    login(client, "chen")
    post = new_post(client, (2,))
    login(client, "shen")
    app_id = apply(client, post)
    with connect() as db:
        db.execute(
            "UPDATE posts SET deadline=? WHERE id=?",
            (
                (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                post["id"],
            ),
        )
    assert client.get(f"/api/posts/{post['id']}").json()["end_reason"] == "expired"
    login(client, "chen")
    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    ended = new_post(client, (1,))
    assert client.post(f"/api/posts/{ended['id']}/end", json={}).status_code == 200
    assert client.patch(
        f"/api/posts/{ended['id']}",
        json={"title": ended["title"], "description": ended["description"], "deadline": future},
    ).status_code == 409
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert client.patch(
        f"/api/posts/{post['id']}",
        json={"title": post["title"], "description": post["description"], "deadline": past},
    ).status_code == 409
    reopened = client.patch(
        f"/api/posts/{post['id']}",
        json={"title": post["title"], "description": post["description"], "deadline": future},
    )
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "open"
    assert reopened.json()["end_reason"] is None
    login(client, "shen")
    mine = next(
        a for a in client.get("/api/me/applications").json() if a["id"] == app_id
    )
    assert mine["status"] == "expired"
    notices = client.get("/api/notices").json()
    assert any("重新开放" in n["body"] for n in notices)
    assert client.post(
        f"/api/posts/{post['id']}/applications",
        json={"role_id": post["roles"][0]["id"]},
    ).status_code == 201
