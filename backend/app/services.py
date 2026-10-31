"""Recruitment state transitions; all callers run inside one SQLite transaction."""

import json
from fastapi import HTTPException
from .db import now, notify
from .auth import public_user


def require_post(db, post_id):
    post = db.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    if not post:
        raise HTTPException(404, "招募不存在")
    return post


def require_owner(post, user):
    if post["owner_id"] != user["id"]:
        raise HTTPException(403, "只有发布者可以操作")


def require_open(post):
    if post["status"] != "open":
        raise HTTPException(409, "招募已结束，结果已锁定")


def post_view(db, post, viewer=None):
    result = dict(post)
    result["tags"] = json.loads(post["tags"])
    result["extras"] = json.loads(post["extras"])
    owner = db.execute("SELECT * FROM users WHERE id=?", (post["owner_id"],)).fetchone()
    result["owner"] = (
        public_user(owner)
        if viewer and viewer["verified"]
        else {"id": owner["id"], "name": owner["name"]}
    )
    roles = []
    for role in db.execute(
        "SELECT * FROM roles WHERE post_id=? ORDER BY id", (post["id"],)
    ):
        roles.append(
            {
                **dict(role),
                "tags": json.loads(role["tags"]),
                "accepted": db.execute(
                    "SELECT count(*) FROM applications WHERE role_id=? AND status='accepted'",
                    (role["id"],),
                ).fetchone()[0],
            }
        )
    result["roles"] = roles
    result["pending_count"] = db.execute(
        "SELECT count(*) FROM applications WHERE post_id=? AND status='pending'",
        (post["id"],),
    ).fetchone()[0]
    result["is_favorite"] = bool(
        viewer
        and db.execute(
            "SELECT 1 FROM favorites WHERE user_id=? AND post_id=?",
            (viewer["id"], post["id"]),
        ).fetchone()
    )
    # Never include application messages, names or portfolio URLs in public data.
    return result


def transition(db, app, status, reason, actor_id):
    db.execute(
        "UPDATE applications SET status=?,reason=?,updated_at=? WHERE id=?",
        (status, reason, now(), app["id"]),
    )
    db.execute(
        "INSERT INTO application_events(application_id,actor_id,status,reason,created_at) VALUES(?,?,?,?,?)",
        (app["id"], actor_id, status, reason, now()),
    )
    notify(db, app["user_id"], reason, app["post_id"])


def decide(db, app_id, user, action, reason):
    app = db.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone()
    if not app:
        raise HTTPException(404, "申请不存在")
    post = require_post(db, app["post_id"])
    require_open(post)
    if action in ("withdraw", "give-up"):
        if app["user_id"] != user["id"]:
            raise HTTPException(403, "只能操作本人的申请")
        expected = "pending" if action == "withdraw" else "accepted"
        if app["status"] != expected:
            raise HTTPException(409, "申请状态已变更，请刷新")
        transition(
            db,
            app,
            "withdrawn",
            "主动撤回申请" if action == "withdraw" else "主动放弃录取",
            user["id"],
        )
        notify(db, post["owner_id"], "有申请者撤回申请或放弃录取。", post["id"])
        return
    require_owner(post, user)
    expected = "accepted" if action == "revoke" else "pending"
    if app["status"] != expected:
        raise HTTPException(409, "申请状态已变更，请刷新")
    if action in ("reject", "revoke"):
        if not reason:
            raise HTTPException(422, "请填写原因")
        transition(
            db,
            app,
            "rejected",
            ("撤销录取：" if action == "revoke" else "未通过：") + reason,
            user["id"],
        )
        return
    applicant = db.execute(
        "SELECT * FROM users WHERE id=?", (app["user_id"],)
    ).fetchone()
    if applicant["banned"] or not applicant["verified"]:
        raise HTTPException(409, "申请者当前不可录取")
    if db.execute(
        "SELECT 1 FROM applications WHERE post_id=? AND user_id=? AND status='accepted'",
        (post["id"], app["user_id"]),
    ).fetchone():
        raise HTTPException(409, "该用户已被此招募录取")
    role = db.execute("SELECT * FROM roles WHERE id=?", (app["role_id"],)).fetchone()
    accepted = db.execute(
        "SELECT count(*) FROM applications WHERE role_id=? AND status='accepted'",
        (role["id"],),
    ).fetchone()[0]
    if accepted >= role["capacity"]:
        raise HTTPException(409, "岗位已满")
    transition(db, app, "accepted", "申请已通过：" + role["name"], user["id"])
    for other in db.execute(
        "SELECT * FROM applications WHERE post_id=? AND user_id=? AND status='pending'",
        (post["id"], app["user_id"]),
    ).fetchall():
        transition(
            db, other, "withdrawn", "同一招募的其他岗位已录取，自动撤回", user["id"]
        )
    if accepted + 1 == role["capacity"]:
        for other in db.execute(
            "SELECT * FROM applications WHERE role_id=? AND status='pending'",
            (role["id"],),
        ).fetchall():
            transition(db, other, "rejected", "岗位名额已满", user["id"])
    remaining = db.execute(
        "SELECT count(*) FROM roles r WHERE r.post_id=? AND r.capacity > (SELECT count(*) FROM applications a WHERE a.role_id=r.id AND a.status='accepted')",
        (post["id"],),
    ).fetchone()[0]
    if remaining == 0:
        db.execute(
            "UPDATE posts SET status='ended',end_reason='filled' WHERE id=?",
            (post["id"],),
        )
        notify(db, post["owner_id"], "全部岗位已满，招募结束，结果已锁定。", post["id"])
