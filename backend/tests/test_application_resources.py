import base64
from datetime import datetime, timedelta, timezone
from conftest import login
from app.db import connect, init_db


def prepare(client):
    owner = login(client, "chen")
    response = client.post("/api/posts", json={
        "title": "申请资料测试", "description": "一起完成项目", "category": "课程项目",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "roles": [{"name": "开发", "capacity": 2}, {"name": "设计", "capacity": 2}],
    })
    assert response.status_code == 201, response.text
    applicant = login(client, "shen")
    return owner, response.json(), applicant


def upload(client, filename="简历.txt", content=b"private resume"):
    return client.post("/api/application-attachments", json={
        "filename": filename, "content_base64": base64.b64encode(content).decode(),
    })


def apply(client, post, resources, role_index=0):
    return client.post(f"/api/posts/{post['id']}/applications", json={
        "role_id": post["roles"][role_index]["id"], "message": "期待合作", "resources": resources,
    })


def test_application_resources_are_private_and_survive_withdrawal(client):
    owner, post, applicant = prepare(client)
    uploaded = upload(client)
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["id"]
    items = [
        {"title": "个人主页", "type": "link", "content": "https://example.com/private-portfolio"},
        {"title": "简历", "type": "attachment", "attachment_id": attachment_id},
    ]
    response = apply(client, post, items)
    assert response.status_code == 201, response.text
    app_id = response.json()["id"]
    path = f"/api/applications/{app_id}/attachments/{attachment_id}"
    own = next(a for a in client.get("/api/me/applications").json() if a["id"] == app_id)
    assert own["resources"][0]["content"] == items[0]["content"]
    assert own["resources"][1]["filename"] == "简历.txt"
    assert client.get(path).content == b"private resume"
    assert client.get(f"/api/applications/{app_id + 999}/attachments/{attachment_id}").status_code == 404
    assert client.post(f"/api/applications/{app_id}/decision", json={"action": "withdraw"}).status_code == 200
    assert client.get(path).status_code == 200
    login(client, "chen")
    review = next(a for a in client.get(f"/api/posts/{post['id']}/applications").json() if a["id"] == app_id)
    assert review["resources"] == own["resources"]
    downloaded = client.get(path)
    assert downloaded.content == b"private resume"
    assert downloaded.headers["x-content-type-options"] == "nosniff"
    assert downloaded.headers["cache-control"] == "no-store"
    assert "attachment;" in downloaded.headers["content-disposition"]
    login(client, "zhou")
    assert client.get(path).status_code == 404
    assert client.get(f"/api/posts/{post['id']}/applications").status_code == 403
    for public_path in [f"/api/posts/{post['id']}", f"/api/people/{applicant['id']}", f"/api/people/{owner['id']}"]:
        public = client.get(public_path)
        assert public.status_code == 200
        assert "private-portfolio" not in public.text
        assert "简历.txt" not in public.text
    client.post("/api/auth/logout", json={})
    assert client.get(path).status_code == 401
    assert upload(client).status_code == 401


def test_application_resources_cannot_reuse_other_users_or_bound_files(client):
    _, post, _ = prepare(client)
    attachment_id = upload(client).json()["id"]
    item = {"title": "简历", "type": "attachment", "attachment_id": attachment_id}
    assert apply(client, post, [item, item]).status_code == 422
    login(client, "zhou")
    assert apply(client, post, [item]).status_code == 422
    login(client, "shen")
    first = apply(client, post, [item])
    assert first.status_code == 201, first.text
    assert apply(client, post, [item], role_index=1).status_code == 422
    # A second independent upload can be used in a different application.
    other_id = upload(client).json()["id"]
    second = apply(client, post, [{**item, "attachment_id": other_id}], role_index=1)
    assert second.status_code == 201, second.text
    assert client.get(f"/api/applications/{second.json()['id']}/attachments/{attachment_id}").status_code == 404
    assert client.get(f"/api/applications/{first.json()['id']}/attachments/{attachment_id}").status_code == 200


def test_application_resources_validate_inputs_and_keep_legacy_portfolio(client):
    _, post, _ = prepare(client)
    for items in [
        [{"title": "网址", "type": "link", "content": "javascript:alert(1)"}],
        [{"title": "附件", "type": "attachment"}],
        [{"title": "", "type": "link", "content": "https://example.com"}],
        [{"title": "网址", "type": "link", "content": "https://example.com"}] * 21,
    ]:
        assert apply(client, post, items).status_code == 422
    for filename, content in [("fake.pdf", b"text"), ("../resume.txt", b"text"), ("resume.exe", b"exe"), ("resume.txt", b"")]:
        assert upload(client, filename, content).status_code == 422
    assert upload(client, content=b"x" * (5 * 1024 * 1024 + 1)).status_code == 422
    response = client.post(f"/api/posts/{post['id']}/applications", json={
        "role_id": post["roles"][0]["id"], "portfolio": "https://example.com/legacy",
    })
    assert response.status_code == 201
    application = next(a for a in client.get("/api/me/applications").json() if a["id"] == response.json()["id"])
    assert application["portfolio"] == "https://example.com/legacy"
    assert application["resources"] == []


def test_application_upload_permissions_and_pending_cleanup(client):
    _, post, applicant = prepare(client)
    bound_id = upload(client).json()["id"]
    response = apply(client, post, [{"title": "简历", "type": "attachment", "attachment_id": bound_id}])
    assert response.status_code == 201
    pending_id = upload(client).json()["id"]
    db = connect()
    try:
        db.execute("UPDATE application_attachments SET created_at=? WHERE owner_id=?", (
            (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(), applicant["id"],
        ))
        assert upload(client).status_code == 201
        assert db.execute("SELECT id FROM application_attachments WHERE id=?", (pending_id,)).fetchone() is None
        assert db.execute("SELECT id FROM application_attachments WHERE id=?", (bound_id,)).fetchone() is not None
        for column in ["verified", "banned"]:
            db.execute(f"UPDATE users SET {column}=? WHERE id=?", (0 if column == "verified" else 1, applicant["id"]))
            assert upload(client).status_code == 403
            db.execute(f"UPDATE users SET {column}=? WHERE id=?", (1 if column == "verified" else 0, applicant["id"]))
    finally:
        db.close()


def test_application_resources_migrate_existing_history_and_delete_with_post(client):
    _, post, _ = prepare(client)
    response = apply(client, post, [])
    assert response.status_code == 201
    app_id = response.json()["id"]
    db = connect()
    try:
        original = dict(db.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone())
        db.execute("ALTER TABLE applications DROP COLUMN resources")
    finally:
        db.close()
    init_db()
    init_db()
    db = connect()
    try:
        assert dict(db.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone()) == original
    finally:
        db.close()
    attachment_id = upload(client).json()["id"]
    second = apply(client, post, [{"title": "附件", "type": "attachment", "attachment_id": attachment_id}], role_index=1)
    assert second.status_code == 201
    login(client, "chen")
    assert client.delete(f"/api/posts/{post['id']}?force=true").status_code == 200
    assert client.get(f"/api/applications/{second.json()['id']}/attachments/{attachment_id}").status_code == 404
    db = connect()
    try:
        assert db.execute("SELECT id FROM application_attachments WHERE id=?", (attachment_id,)).fetchone() is None
    finally:
        db.close()
