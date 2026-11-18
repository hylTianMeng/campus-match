"""Recruitment state transitions; all callers run inside one SQLite transaction."""

import json
from fastapi import HTTPException
from .db import now, notify
from .auth import public_user, avatar_url
from .governance import require_interaction, public_post, blocked


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


def legacy_attachment(db, post, attachments=None):
    custom_ids = {item.get("attachment_id") for item in json.loads(post["extras"]).get("items", [])}
    if attachments is None:
        attachments = db.execute(
            "SELECT id,filename,length(content) AS size FROM attachments WHERE post_id=? ORDER BY id",
            (post["id"],),
        )
    return next((row for row in attachments if row["id"] not in custom_ids), None)


def post_view(db, post, viewer=None):
    result = dict(post)
    owner_status = db.execute("SELECT banned,deleted_at FROM users WHERE id=?", (post["owner_id"],)).fetchone()
    result["interaction_paused"] = bool(post["taken_down"] or owner_status["banned"] or owner_status["deleted_at"])
    result["unavailable"] = not public_post(db, post, viewer)
    if result["unavailable"]:
        return {"id": post["id"], "title": "内容暂不可查看", "unavailable": True}
    result["tags"] = json.loads(post["tags"])
    result["extras"] = json.loads(post["extras"])
    attachments = [dict(row) for row in db.execute(
        "SELECT id,filename,length(content) AS size FROM attachments WHERE post_id=? ORDER BY id",
        (post["id"],),
    )]
    attachment = legacy_attachment(db, post, attachments)
    result["attachments"] = attachments
    result["attachment"] = dict(attachment) if attachment else None
    owner = db.execute("SELECT * FROM users WHERE id=?", (post["owner_id"],)).fetchone()
    result["owner"] = (
        public_user(owner)
        if viewer and viewer["verified"]
        else {"id": owner["id"], "name": owner["name"], "avatar_url": avatar_url(owner)}
    )
    roles = []
    for role in db.execute(
        "SELECT * FROM roles WHERE post_id=? ORDER BY id", (post["id"],)
    ):
        roles.append(
            {
                **dict(role),
                "tags": json.loads(role["tags"]),
                "accepting": bool(role["accepting"]),
                "application_count": db.execute("SELECT count(*) FROM applications WHERE role_id=?", (role["id"],)).fetchone()[0],
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
    event_id = db.execute(
        "INSERT INTO application_events(application_id,actor_id,status,reason,created_at) VALUES(?,?,?,?,?)",
        (app["id"], actor_id, status, reason, now()),
    ).lastrowid
    notify(db, app["user_id"], reason, app["post_id"], event_key=f"application-event:{event_id}", kind="application", target_path="/applications")


def ensure_group_chat(db, post, user_id, role_name="成员"):
    """首个录取通过时自动创建群聊，并把发布者与新录取成员加入。

    幂等：群聊与招募一一对应，重复录取时仅刷新岗位标注（保留禁言/删除状态）。
    发布者岗位标注为“发布者”，录取成员标注其实际录取岗位名。
    """
    chat = db.execute(
        "SELECT * FROM group_chats WHERE post_id=?", (post["id"],)
    ).fetchone()
    if not chat:
        chat_id = db.execute(
            "INSERT INTO group_chats(post_id,created_at) VALUES(?,?)",
            (post["id"], now()),
        ).lastrowid
        db.execute(
            "INSERT INTO chat_members(chat_id,user_id,role_name) VALUES(?,?,'发布者')",
            (chat_id, post["owner_id"]),
        )
        title = post["title"]
        notify(
            db,
            post["owner_id"],
            f"「{title}」已产生首个录取，组队群聊已创建，可在消息中心查看。",
            event_key=f"chat-created:{post['id']}:owner",
            kind="chat",
            target_path="/chats",
        )
    else:
        chat_id = chat["id"]
        title = post["title"]
    db.execute(
        """INSERT INTO chat_members(chat_id,user_id,role_name) VALUES(?,?,?)
           ON CONFLICT(chat_id,user_id) DO UPDATE SET role_name=excluded.role_name""",
        (chat_id, user_id, role_name),
    )
    if user_id != post["owner_id"]:
        notify(
            db,
            user_id,
            f"你已被「{title}」录取，组队群聊已就绪，可在消息中心查看。",
            event_key=f"chat-created:{post['id']}:{user_id}",
            kind="chat",
            target_path="/chats",
        )


def remove_group_member(db, post, user_id, note):
    """撤销录取或放弃录取时，把成员移出对应群聊（群聊不存在时为空操作）。"""
    chat = db.execute(
        "SELECT id FROM group_chats WHERE post_id=?", (post["id"],)
    ).fetchone()
    if not chat:
        return
    db.execute(
        "DELETE FROM chat_members WHERE chat_id=? AND user_id=?",
        (chat["id"], user_id),
    )
    notify(
        db,
        user_id,
        f"你已退出「{post['title']}」的群聊。{note}",
        event_key=f"chat-left:{post['id']}:{user_id}",
        kind="chat",
        target_path="/chats",
    )


def decide(db, app_id, user, action, reason, allow_reapply=True):
    app = db.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone()
    if not app:
        raise HTTPException(404, "申请不存在")
    post = require_post(db, app["post_id"])
    require_open(post)
    require_interaction(db, post)
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
        actor = db.execute("SELECT name FROM users WHERE id=?", (app["user_id"],)).fetchone()
        role = db.execute("SELECT name FROM roles WHERE id=?", (app["role_id"],)).fetchone()
        verb = "撤回了申请" if action == "withdraw" else "放弃了录取"
        notify(db, post["owner_id"], f"{actor['name']} {verb}（岗位：{role['name']}）。可在申请管理中处理。",
               post["id"], event_key=f"application-owner:{app['id']}:{action}", kind="application",
               target_path=f"/posts/{post['id']}/applications")
        if action == "give-up":
            remove_group_member(db, post, app["user_id"], "如需重新加入，可再次申请并被录取。")
        return
    require_owner(post, user)
    expected = "accepted" if action == "revoke" else "pending"
    if app["status"] != expected:
        raise HTTPException(409, "申请状态已变更，请刷新")
    if action in ("reject", "revoke"):
        if not reason:
            raise HTTPException(422, "请填写原因")
        text = ("撤销录取：" if action == "revoke" else "未通过：") + reason
        if action == "reject" and not allow_reapply:
            db.execute(
                "INSERT OR IGNORE INTO application_bans(post_id,user_id,reason,created_at) VALUES(?,?,?,?)",
                (post["id"], app["user_id"], reason, now()),
            )
        transition(db, app, "rejected", text, user["id"])
        if action == "revoke":
            remove_group_member(db, post, app["user_id"], "如对结果有疑问，可联系发布者沟通。")
        return
    applicant = db.execute(
        "SELECT * FROM users WHERE id=?", (app["user_id"],)
    ).fetchone()
    if blocked(db, app["user_id"], post["owner_id"]):
        raise HTTPException(409, "当前申请无法继续审核")
    if applicant["banned"] or not applicant["verified"] or applicant["deleted_at"]:
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
    ensure_group_chat(db, post, app["user_id"], role["name"])
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
        notify(db, post["owner_id"], "全部岗位已满，招募结束，结果已锁定。", post["id"], event_key=f"filled:{post['id']}", kind="recruitment", target_path="/posts")
