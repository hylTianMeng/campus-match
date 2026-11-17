"""Shared moderation checks and atomic actions used by the existing workflows."""

from fastapi import HTTPException
from .db import now, notify


def blocked(db, sender_id, recipient_id):
    return bool(
        db.execute(
            """SELECT 1 FROM blocks b JOIN users actor ON actor.id=b.blocker_id
            JOIN users target ON target.id=b.blocked_id
            WHERE b.blocker_id=? AND b.blocked_id=? AND actor.is_admin=0 AND target.is_admin=0""",
            (recipient_id, sender_id),
        ).fetchone()
    )


def conversation_blocked(db, first_user_id, second_user_id):
    return bool(db.execute(
        """SELECT 1 FROM blocks b JOIN users actor ON actor.id=b.blocker_id
        JOIN users target ON target.id=b.blocked_id
        WHERE actor.is_admin=0 AND target.is_admin=0
        AND ((b.blocker_id=? AND b.blocked_id=?) OR (b.blocker_id=? AND b.blocked_id=?))""",
        (first_user_id, second_user_id, second_user_id, first_user_id),
    ).fetchone())


def public_post(db, post, viewer=None):
    owner = db.execute("SELECT * FROM users WHERE id=?", (post["owner_id"],)).fetchone()
    restricted = bool(
        post["taken_down"]
        or owner["deleted_at"]
        or (owner["banned"] and post["status"] == "open")
    )
    privileged = bool(viewer and (viewer["id"] == owner["id"] or viewer["is_admin"]))
    return privileged or (not restricted and bool(owner["public_posts"]))


def require_visible(db, post, viewer=None):
    if not public_post(db, post, viewer):
        raise HTTPException(404, "此内容暂不可查看")


def require_interaction(db, post):
    owner = db.execute(
        "SELECT banned,deleted_at FROM users WHERE id=?", (post["owner_id"],)
    ).fetchone()
    if post["taken_down"] or owner["banned"] or owner["deleted_at"]:
        raise HTTPException(409, "招募当前暂停交互")


def set_user_ban(db, actor, target_id, banned, reason, *, from_report=False):
    target = db.execute("SELECT * FROM users WHERE id=?", (target_id,)).fetchone()
    if not target or target["deleted_at"]:
        raise HTTPException(404, "用户不存在或已注销")
    if banned and (target_id == actor["id"] or target["is_admin"]):
        raise HTTPException(403, "不能对本人或管理员执行此操作")
    if bool(target["banned"]) == banned:
        return False
    db.execute("UPDATE users SET banned=? WHERE id=?", (banned, target_id))
    action = "ban" if banned else "unban"
    action_id = db.execute(
        "INSERT INTO admin_actions(admin_id,target_user_id,action,reason,created_at) VALUES(?,?,?,?,?)",
        (actor["id"], target_id, action, reason, now()),
    ).lastrowid
    explanation = "经核实，账号违反平台规范。" if from_report else reason
    text = ("你的账号已被封禁。" if banned else "你的账号已解封。") + explanation
    notify(db, target_id, text, event_key=f"user-action:{action_id}", kind="moderation")
    # Notify affected applicants without exposing any report evidence or administrator notes.
    for row in db.execute(
        "SELECT DISTINCT a.user_id,a.post_id FROM applications a JOIN posts p ON p.id=a.post_id WHERE p.owner_id=? AND p.status='open'",
        (target_id,),
    ):
        notify(
            db,
            row["user_id"],
            "相关招募暂不可交互。"
            if banned
            else "相关账号限制已解除，请查看招募最新状态。",
            row["post_id"],
            event_key=f"user-action:{action_id}:post:{row['post_id']}",
            kind="moderation",
        )
    return True


def set_post_restriction(db, actor, post_id, taken_down, reason, *, from_report=False):
    post = db.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    if not post:
        raise HTTPException(404, "招募不存在")
    if bool(post["taken_down"]) == taken_down:
        return False
    if post["status"] != "open" or post["deadline"] <= now():
        raise HTTPException(409, "招募已结束或截止，不能下架或恢复")
    owner = db.execute(
        "SELECT deleted_at FROM users WHERE id=?", (post["owner_id"],)
    ).fetchone()
    if owner["deleted_at"]:
        raise HTTPException(409, "发布者已注销，不能恢复或处置招募")
    db.execute("UPDATE posts SET taken_down=? WHERE id=?", (taken_down, post_id))
    action = "take-down" if taken_down else "restore"
    action_id = db.execute(
        "INSERT INTO post_actions(admin_id,post_id,action,reason,created_at) VALUES(?,?,?,?,?)",
        (actor["id"], post_id, action, reason, now()),
    ).lastrowid
    text = (
        f"您的「{post['title']}」招募已被下架，申请和审核暂停。"
        if taken_down
        else "招募的独立下架限制已解除，其他账号限制仍适用。"
    )
    explanation = "经核实，招募内容违反平台规范。" if from_report else reason
    notify(
        db,
        post["owner_id"],
        text + explanation,
        post_id,
        event_key=f"post-action:{action_id}",
        kind="moderation",
    )
    for row in db.execute(
        "SELECT DISTINCT user_id FROM applications WHERE post_id=?", (post_id,)
    ):
        if row["user_id"] != post["owner_id"]:
            notify(
                db,
                row["user_id"],
                text,
                post_id,
                event_key=f"post-action:{action_id}",
                kind="moderation",
            )
    return True
