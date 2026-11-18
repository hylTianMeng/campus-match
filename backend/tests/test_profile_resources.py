import base64
from conftest import login
from app.db import connect, init_db


def upload(client, filename="介绍.txt", content=b"my portfolio"):
    return client.post("/api/auth/me/attachments", json={
        "filename": filename, "content_base64": base64.b64encode(content).decode(),
    })


def save(client, resources):
    return client.patch("/api/auth/me", json={"name": "同学", "resources": resources})


def test_profile_resources_save_view_replace_and_remove(client):
    owner = login(client, "chen")
    uploaded = upload(client)
    assert uploaded.status_code == 201
    attachment_id = uploaded.json()["id"]
    path = f"/api/people/{owner['id']}/attachments/{attachment_id}"
    assert client.get(path).status_code == 404  # Upload alone does not publish.
    items = [
        {"title": "个人主页", "type": "link", "content": "https://example.com/me"},
        {"title": "作品集", "type": "attachment", "attachment_id": attachment_id},
    ]
    response = save(client, items)
    assert response.status_code == 200, response.text
    resources = response.json()["resources"]
    assert resources[1]["filename"] == "介绍.txt"
    assert client.get("/api/auth/me").json()["resources"] == resources
    # Updating privacy settings from an older client preserves resources.
    assert client.patch("/api/auth/me", json={"name": "同学", "searchable": False}).status_code == 200
    login(client, "lin")
    profile = client.get(f"/api/people/{owner['id']}").json()
    assert profile["resources"] == resources
    assert "email" not in profile
    downloaded = client.get(path)
    assert downloaded.content == b"my portfolio"
    assert downloaded.headers["x-content-type-options"] == "nosniff"
    assert "attachment;" in downloaded.headers["content-disposition"]
    assert client.get(f"/api/people/1/attachments/{attachment_id}").status_code == 404
    login(client, "chen")
    replacement = upload(client, "新版.txt", b"updated").json()["id"]
    items[1]["attachment_id"] = replacement
    assert save(client, items).status_code == 200
    assert client.get(path).status_code == 404
    assert save(client, []).json()["resources"] == []
    assert client.get(f"/api/people/{owner['id']}/attachments/{replacement}").status_code == 404


def test_profile_resources_ownership_and_validation(client):
    login(client, "chen")
    attachment_id = upload(client).json()["id"]
    item = {"title": "介绍", "type": "attachment", "attachment_id": attachment_id}
    assert save(client, [item, item]).status_code == 422
    login(client, "lin")
    assert save(client, [item]).status_code == 422
    for items in [
        [{"title": "危险网址", "type": "link", "content": "javascript:alert(1)"}],
        [{"title": "缺少附件", "type": "attachment"}],
        [{"title": "", "type": "link", "content": "https://example.com"}],
        [{"title": "主页", "type": "link", "content": "https://example.com"}] * 21,
    ]:
        assert save(client, items).status_code == 422
    for filename, content in [("file.exe", b"exe"), ("fake.pdf", b"wrong"), ("../a.txt", b"text"), ("empty.txt", b"")]:
        assert upload(client, filename, content).status_code == 422
    assert upload(client, content=b"x" * (5 * 1024 * 1024 + 1)).status_code == 422


def test_profile_resources_access_and_account_deletion(client):
    owner = login(client, "chen")
    attachment_id = upload(client).json()["id"]
    assert save(client, [{"title": "介绍", "type": "attachment", "attachment_id": attachment_id}]).status_code == 200
    path = f"/api/people/{owner['id']}/attachments/{attachment_id}"
    client.post("/api/auth/logout", json={})
    assert client.get(path).status_code == 401
    assert upload(client).status_code == 401
    viewer = login(client, "lin")
    db = connect()
    try:
        db.execute("UPDATE users SET verified=0 WHERE id=?", (viewer["id"],))
        assert client.get(path).status_code == 403
        assert upload(client).status_code == 403
        db.execute("UPDATE users SET verified=1 WHERE id=?", (viewer["id"],))
        db.execute("UPDATE users SET banned=1 WHERE id=?", (owner["id"],))
        assert client.get(path).status_code == 404
        db.execute("UPDATE users SET banned=0 WHERE id=?", (owner["id"],))
    finally:
        db.close()
    login(client, "chen")
    assert client.post("/api/auth/delete", json={"password": "test-password"}).status_code == 200
    login(client, "lin")
    assert client.get(path).status_code == 404
    db = connect()
    try:
        assert db.execute("SELECT count(*) FROM profile_attachments WHERE owner_id=?", (owner["id"],)).fetchone()[0] == 0
        assert db.execute("SELECT resources FROM users WHERE id=?", (owner["id"],)).fetchone()[0] == "[]"
    finally:
        db.close()


def test_profile_resources_migration_is_additive_and_repeatable(client):
    db = connect()
    try:
        original = dict(db.execute("SELECT * FROM users WHERE id=1").fetchone())
        db.execute("ALTER TABLE users DROP COLUMN resources")
    finally:
        db.close()
    init_db()
    init_db()
    db = connect()
    try:
        migrated = dict(db.execute("SELECT * FROM users WHERE id=1").fetchone())
        assert migrated == original
    finally:
        db.close()
