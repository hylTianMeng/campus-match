"""组队成功后的临时群聊（D 模块扩展）。

生命周期：首个录取通过自动建群 → 招募结束后 7 天遣散转只读（可由发布者提前解散）
→ 成员在招募结束后可删除群聊（招募未结束时删除入口存在但未生效）→ 全员删除后
进入 7 天保留期（普通成员不可见，管理员可审计查看）→ 保留期到期物理清库。
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from ..auth import admin, current_user, student, avatar_url
from ..db import (
    get_db,
    get_db_readonly,
    now,
    notify,
    CHAT_RETENTION_DAYS,
    CHAT_COUNTDOWN_DAYS,
)
from ..governance import require_interaction
from ..schemas import Message, Reason

router = APIRouter(prefix="/api", tags=["群聊"])


def require_chat(db, chat_id):
    chat = db.execute("SELECT * FROM group_chats WHERE id=?", (chat_id,)).fetchone()
    if not chat:
        raise HTTPException(404, "群聊不存在")
    return chat


def require_membership(db, chat_id, user_id):
    """成员且未删除该群聊才可见；保留期内的群聊对普通成员整体不可见。"""
    chat = require_chat(db, chat_id)
    if chat["retention_until"]:
        raise HTTPException(404, "群聊不存在")
    member = db.execute(
        "SELECT * FROM chat_members WHERE chat_id=? AND user_id=?",
        (chat_id, user_id),
    ).fetchone()
    if not member or member["deleted_at"]:
        raise HTTPException(403, "你不在该群聊中")
    return chat, member


def chat_post(db, chat):
    post = db.execute("SELECT * FROM posts WHERE id=?", (chat["post_id"],)).fetchone()
    if not post:
        raise HTTPException(404, "群聊不存在")
    return post


def chat_view(db, chat, post, member=None):
    """群聊信息视图；member 为当前请求者成员行（可为 None，管理员视角）。"""
    owner = db.execute("SELECT * FROM users WHERE id=?", (post["owner_id"],)).fetchone()
    members = db.execute(
        """SELECT m.user_id,m.muted,m.role_name,m.deleted_at,u.name,u.avatar_path
           FROM chat_members m JOIN users u ON u.id=m.user_id
           WHERE m.chat_id=? ORDER BY (m.user_id=?) DESC, m.user_id""",
        (chat["id"], post["owner_id"]),
    ).fetchall()
    member_list = [
        {
            "id": row["user_id"],
            "name": row["name"],
            "avatar_url": avatar_url(row),
            "is_owner": row["user_id"] == post["owner_id"],
            "role_name": "发布者" if row["user_id"] == post["owner_id"] else row["role_name"],
            "muted": bool(row["muted"]),
            "left": bool(row["deleted_at"]),
        }
        for row in members
    ]
    can_send = bool(
        member
        and not member["deleted_at"]
        and not chat["read_only"]
        and not chat["dissolved_at"]
        and not chat["retention_until"]
        and not member["muted"]
        and not post["taken_down"]
        and not owner["banned"]
        and not owner["deleted_at"]
    )
    # 满员（招募结束）后 7 天自动遣散：给出遣散截止时间供前端倒计时。
    scatter_at = None
    if chat["full_at"]:
        try:
            scatter_at = (
                datetime.fromisoformat(chat["full_at"])
                + timedelta(days=CHAT_COUNTDOWN_DAYS)
            ).isoformat()
        except ValueError:
            scatter_at = None
    view = {
        "id": chat["id"],
        "post_id": chat["post_id"],
        "title": post["title"],
        "post_status": post["status"],
        "owner": {"id": owner["id"], "name": owner["name"]},
        "created_at": chat["created_at"],
        "full_at": chat["full_at"],
        "scatter_at": scatter_at,
        "dissolved_at": chat["dissolved_at"],
        "read_only": bool(chat["read_only"]),
        "dissolved": bool(chat["dissolved_at"]),
        "dissolved_by_name": (
            db.execute("SELECT name FROM users WHERE id=?", (chat["dissolved_by"],)).fetchone()["name"]
            if chat["dissolved_by"]
            else None
        ),
        "retention_until": chat["retention_until"],
        "members": member_list,
        "can_send": can_send,
        # 招募未结束时删除入口显示但未生效；结束后才允许删除。
        "can_delete": bool(post["status"] == "ended"),
        "is_owner": bool(member and member["user_id"] == post["owner_id"]),
    }
    if member:
        view["muted"] = bool(member["muted"])
        view["last_read_id"] = member["last_read_id"]
    return view


@router.get("/chats")
def my_chats(user=Depends(current_user), db=Depends(get_db_readonly)):
    """消息中心会话列表的群聊部分：未删除、未进入保留期的群聊。"""
    return [
        dict(row)
        for row in db.execute(
            """SELECT c.id,c.post_id,c.read_only,c.dissolved_at,c.retention_until,
               p.title,p.status AS post_status,
               (SELECT max(id) FROM chat_messages x WHERE x.chat_id=c.id) AS last_id,
               (SELECT body FROM chat_messages x WHERE x.chat_id=c.id
                 AND x.id NOT IN (
                     SELECT d.message_id FROM chat_message_deletions d
                     WHERE d.chat_id=c.id AND d.user_id=m.user_id
                 ) ORDER BY id DESC LIMIT 1) AS last_body,
               (SELECT created_at FROM chat_messages x WHERE x.chat_id=c.id
                 AND x.id NOT IN (
                     SELECT d.message_id FROM chat_message_deletions d
                     WHERE d.chat_id=c.id AND d.user_id=m.user_id
                 ) ORDER BY id DESC LIMIT 1) AS last_at,
               (SELECT count(*) FROM chat_messages x
                 WHERE x.chat_id=c.id AND x.id>m.last_read_id AND x.sender_id<>m.user_id
                   AND x.id NOT IN (
                       SELECT d.message_id FROM chat_message_deletions d
                       WHERE d.chat_id=c.id AND d.user_id=m.user_id
                   )) AS unread_count
               FROM chat_members m
               JOIN group_chats c ON c.id=m.chat_id
               JOIN posts p ON p.id=c.post_id
               WHERE m.user_id=? AND m.deleted_at IS NULL AND c.retention_until IS NULL
               ORDER BY last_id DESC, c.id DESC""",
            (user["id"],),
        )
    ]


@router.get("/chats/{chat_id}/info")
def chat_info(chat_id: int, user=Depends(current_user), db=Depends(get_db_readonly)):
    chat, member = require_membership(db, chat_id, user["id"])
    post = chat_post(db, chat)
    return chat_view(db, chat, post, member)


@router.get("/chats/{chat_id}/messages")
def chat_messages(
    chat_id: int,
    after: int = Query(0, ge=0),
    user=Depends(current_user),
    db=Depends(get_db_readonly),
):
    require_membership(db, chat_id, user["id"])
    return [
        dict(row)
        for row in db.execute(
            """SELECT m.id,m.sender_id,u.name AS sender_name,m.body,m.created_at
               FROM chat_messages m JOIN users u ON u.id=m.sender_id
               WHERE m.chat_id=? AND m.id>?
                 AND m.id NOT IN (
                     SELECT message_id FROM chat_message_deletions
                     WHERE chat_id=? AND user_id=?
                 )
               ORDER BY m.id LIMIT 200""",
            (chat_id, after, chat_id, user["id"]),
        )
    ]


@router.delete("/chats/{chat_id}/messages/{message_id}")
def delete_chat_message(
    chat_id: int, message_id: int, user=Depends(student), db=Depends(get_db)
):
    """成员单方面删除一条群聊消息（仅自己不再可见，其他成员与管理员不受影响）。"""
    require_membership(db, chat_id, user["id"])
    message = db.execute(
        "SELECT id FROM chat_messages WHERE id=? AND chat_id=?", (message_id, chat_id)
    ).fetchone()
    if not message:
        raise HTTPException(404, "消息不存在")
    db.execute(
        "INSERT OR IGNORE INTO chat_message_deletions(chat_id,user_id,message_id,created_at) VALUES(?,?,?,?)",
        (chat_id, user["id"], message_id, now()),
    )
    return {"ok": True}


@router.post("/chats/{chat_id}", status_code=201)
def send_chat_message(chat_id: int, data: Message, user=Depends(student), db=Depends(get_db)):
    if data.client_id:
        existing = db.execute(
            "SELECT id,body FROM chat_messages WHERE chat_id=? AND sender_id=? AND client_id=?",
            (chat_id, user["id"], data.client_id),
        ).fetchone()
        if existing:
            if existing["body"] != data.body:
                raise HTTPException(409, "请求标识已用于其他消息")
            return {"id": existing["id"]}
    chat, member = require_membership(db, chat_id, user["id"])
    post = chat_post(db, chat)
    require_interaction(db, post)
    if chat["read_only"] or chat["dissolved_at"] or chat["retention_until"]:
        raise HTTPException(409, "群聊已遣散，转为只读")
    if member["muted"]:
        raise HTTPException(403, "你在当前群聊中被禁言")
    message_id = db.execute(
        "INSERT INTO chat_messages(chat_id,sender_id,body,client_id,created_at) VALUES(?,?,?,?,?)",
        (chat_id, user["id"], data.body, data.client_id, now()),
    ).lastrowid
    return {"id": message_id}


@router.post("/chats/{chat_id}/read")
def read_chat(chat_id: int, user=Depends(current_user), db=Depends(get_db)):
    chat, member = require_membership(db, chat_id, user["id"])
    last_id = db.execute(
        "SELECT max(id) FROM chat_messages WHERE chat_id=?", (chat_id,)
    ).fetchone()[0]
    if last_id and last_id > member["last_read_id"]:
        db.execute(
            "UPDATE chat_members SET last_read_id=? WHERE chat_id=? AND user_id=?",
            (last_id, chat_id, user["id"]),
        )
    return {"ok": True}


@router.delete("/chats/{chat_id}")
def delete_chat(chat_id: int, user=Depends(student), db=Depends(get_db)):
    """成员删除群聊（仅影响自己）。招募未结束时未生效；全员删除后进入保留期。

    发布者（群主）不能删除群聊，只能解散——解散等效于发布者这边的删除。
    """
    chat, member = require_membership(db, chat_id, user["id"])
    post = chat_post(db, chat)
    if post["owner_id"] == user["id"]:
        raise HTTPException(409, "发布者不能删除群聊，请使用解散群聊")
    if post["status"] != "ended":
        raise HTTPException(409, "由于该群聊对应招募还未结束，无法删除")
    db.execute(
        "UPDATE chat_members SET deleted_at=? WHERE chat_id=? AND user_id=?",
        (now(), chat_id, user["id"]),
    )
    remaining = db.execute(
        "SELECT count(*) FROM chat_members WHERE chat_id=? AND deleted_at IS NULL",
        (chat_id,),
    ).fetchone()[0]
    if remaining == 0 and not chat["retention_until"]:
        deadline = (
            datetime.now(timezone.utc) + timedelta(days=CHAT_RETENTION_DAYS)
        ).isoformat()
        db.execute(
            "UPDATE group_chats SET retention_until=? WHERE id=?", (deadline, chat_id)
        )
    return {"ok": True}


@router.post("/chats/{chat_id}/dissolve")
def dissolve_chat(chat_id: int, user=Depends(student), db=Depends(get_db)):
    """发布者手动解散群聊：转为只读并通知成员，成员随后可各自删除。"""
    chat, _member = require_membership(db, chat_id, user["id"])
    post = chat_post(db, chat)
    if post["owner_id"] != user["id"]:
        raise HTTPException(403, "只有发布者可以解散群聊")
    if chat["dissolved_at"]:
        raise HTTPException(409, "群聊已解散")
    db.execute(
        "UPDATE group_chats SET dissolved_by=?,dissolved_at=?,read_only=1 WHERE id=?",
        (user["id"], now(), chat_id),
    )
    # 解散对发布者等效于删除：群聊从其消息中心移除。
    db.execute(
        "UPDATE chat_members SET deleted_at=coalesce(deleted_at,?) WHERE chat_id=? AND user_id=?",
        (now(), chat_id, user["id"]),
    )
    # 若其余成员均已删除，同样进入保留期。
    remaining = db.execute(
        "SELECT count(*) FROM chat_members WHERE chat_id=? AND deleted_at IS NULL",
        (chat_id,),
    ).fetchone()[0]
    if remaining == 0 and not chat["retention_until"]:
        deadline = (
            datetime.now(timezone.utc) + timedelta(days=CHAT_RETENTION_DAYS)
        ).isoformat()
        db.execute("UPDATE group_chats SET retention_until=? WHERE id=?", (deadline, chat_id))
    for row in db.execute(
        "SELECT user_id FROM chat_members WHERE chat_id=? AND deleted_at IS NULL AND user_id<>?",
        (chat_id, user["id"]),
    ).fetchall():
        notify(
            db,
            row["user_id"],
            f"「{post['title']}」的群聊已由发布者解散，转为只读。",
            event_key=f"chat-dissolved:{chat_id}",
            kind="chat",
            target_path="/chats",
        )
    return {"ok": True}


# ---------------------------------------------------------------------------
# 管理端：群聊治理（对齐私信的访问审计模式）
# ---------------------------------------------------------------------------


def _admin_chat_list_row(db, chat):
    post = db.execute(
        "SELECT title,status,owner_id,updated_at FROM posts WHERE id=?", (chat["post_id"],)
    ).fetchone()
    if not post:
        return None
    owner = db.execute(
        "SELECT name FROM users WHERE id=?", (post["owner_id"],)
    ).fetchone()
    status = "retention" if chat["retention_until"] else (
        "dissolved" if chat["dissolved_at"] else (
            "read_only" if chat["read_only"] else (
                "countdown" if post["status"] == "ended" else "active"
            )
        )
    )
    scatter_at = None
    if chat["full_at"]:
        try:
            scatter_at = (
                datetime.fromisoformat(chat["full_at"])
                + timedelta(days=CHAT_COUNTDOWN_DAYS)
            ).isoformat()
        except ValueError:
            scatter_at = None
    members = db.execute(
        """SELECT m.user_id,m.role_name,m.deleted_at,u.name
           FROM chat_members m JOIN users u ON u.id=m.user_id
           WHERE m.chat_id=? ORDER BY (m.user_id=?) DESC, m.user_id""",
        (chat["id"], post["owner_id"]),
    ).fetchall()
    return {
        "id": chat["id"],
        "post_id": chat["post_id"],
        "title": post["title"],
        "post_status": post["status"],
        "owner_id": post["owner_id"],
        "owner_name": owner["name"] if owner else None,
        "created_at": chat["created_at"],
        "full_at": chat["full_at"],
        "dissolved_at": chat["dissolved_at"],
        "scatter_at": scatter_at,
        "members": [
            {
                "id": row["user_id"],
                "name": row["name"],
                "role_name": "发布者" if row["user_id"] == post["owner_id"] else row["role_name"],
                "is_owner": row["user_id"] == post["owner_id"],
                "left": bool(row["deleted_at"]),
            }
            for row in members
        ],
        "member_count": db.execute(
            "SELECT count(*) FROM chat_members WHERE chat_id=? AND deleted_at IS NULL",
            (chat["id"],),
        ).fetchone()[0],
        "message_count": db.execute(
            "SELECT count(*) FROM chat_messages WHERE chat_id=?", (chat["id"],)
        ).fetchone()[0],
        "status": status,
        "retention_until": chat["retention_until"],
        "updated_at": db.execute(
            "SELECT max(created_at) FROM chat_messages WHERE chat_id=?", (chat["id"],)
        ).fetchone()[0],
    }


@router.get("/admin/chats")
def admin_chats(
    q: str = "",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    rows = db.execute(
        """SELECT c.* FROM group_chats c JOIN posts p ON p.id=c.post_id
           WHERE (?='' OR instr(p.title,?)>0)
           ORDER BY c.id DESC LIMIT ? OFFSET ?""",
        (q, q, limit, offset),
    ).fetchall()
    return [row for row in (_admin_chat_list_row(db, chat) for chat in rows) if row]


def _audited_chat_messages(db, audit, after):
    return [
        dict(row)
        for row in db.execute(
            """SELECT m.id,m.sender_id,u.name AS sender_name,m.body,m.created_at
               FROM chat_messages m JOIN users u ON u.id=m.sender_id
               WHERE m.chat_id=? AND m.id>? ORDER BY m.id LIMIT 200""",
            (audit["chat_id"], after),
        )
    ]


@router.post("/admin/chats/{chat_id}/access")
def open_chat(chat_id: int, data: Reason, user=Depends(admin), db=Depends(get_db)):
    """管理员查看群聊前必须留痕：写入不可篡改的访问审计，授权 15 分钟有效。"""
    chat = require_chat(db, chat_id)
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    audit_id = db.execute(
        "INSERT INTO chat_access_audits(admin_id,chat_id,reason,created_at,expires_at) VALUES(?,?,?,?,?)",
        (user["id"], chat["id"], data.reason, now(), expires),
    ).lastrowid
    audit = db.execute(
        "SELECT * FROM chat_access_audits WHERE id=?", (audit_id,)
    ).fetchone()
    post = db.execute("SELECT * FROM posts WHERE id=?", (chat["post_id"],)).fetchone()
    return {
        "audit": dict(audit),
        "chat": chat_view(db, chat, post) if post else None,
        "messages": _audited_chat_messages(db, audit, 0),
    }


@router.get("/admin/chats/access/{audit_id}")
def page_chat(
    audit_id: int,
    after: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    audit = db.execute(
        "SELECT * FROM chat_access_audits WHERE id=? AND admin_id=?",
        (audit_id, user["id"]),
    ).fetchone()
    if not audit or audit["expires_at"] <= now():
        raise HTTPException(403, "访问授权已失效，请重新填写原因")
    return _audited_chat_messages(db, audit, after)


@router.post("/admin/chats/{chat_id}/dissolve")
def admin_dissolve_chat(chat_id: int, user=Depends(admin), db=Depends(get_db)):
    """管理员强制解散群聊。

    前置条件：该管理员必须先对该群聊完成“聊天内容审核”（存在未过期的访问审计），
    然后才能解散；解散后转为只读并通知成员。
    """
    chat = require_chat(db, chat_id)
    post = chat_post(db, chat)
    if chat["dissolved_at"]:
        raise HTTPException(409, "群聊已解散")
    audit = db.execute(
        """SELECT id FROM chat_access_audits
           WHERE chat_id=? AND admin_id=? AND expires_at>?
           ORDER BY id DESC LIMIT 1""",
        (chat_id, user["id"], now()),
    ).fetchone()
    if not audit:
        raise HTTPException(
            403, "请先通过“聊天内容审核”查看该群聊，再进行解散操作"
        )
    db.execute(
        "UPDATE group_chats SET dissolved_by=?,dissolved_at=?,read_only=1 WHERE id=?",
        (user["id"], now(), chat_id),
    )
    for row in db.execute(
        "SELECT user_id FROM chat_members WHERE chat_id=? AND deleted_at IS NULL",
        (chat_id,),
    ).fetchall():
        notify(
            db,
            row["user_id"],
            f"「{post['title']}」的群聊已由管理员解散，转为只读。",
            event_key=f"chat-admin-dissolved:{chat_id}",
            kind="chat",
            target_path="/chats",
        )
    return {"ok": True}


@router.get("/admin/chat-audits")
def chat_access_history(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    return [
        dict(row)
        for row in db.execute(
            """SELECT a.*,u.name AS admin_name,c.post_id,p.title AS chat_title
               FROM chat_access_audits a JOIN users u ON u.id=a.admin_id
               LEFT JOIN group_chats c ON c.id=a.chat_id
               LEFT JOIN posts p ON p.id=c.post_id
               ORDER BY a.id DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        )
    ]
