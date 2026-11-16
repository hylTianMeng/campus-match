"""Personal safety tools, reports, and audited moderation workflows."""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from ..auth import current_user, student, admin, public_user
from ..db import get_db, get_db_readonly, now, notify
from ..schemas import ReportCreate, ReportDecision, Reason, ConversationAccess
from ..governance import require_visible, set_user_ban, set_post_restriction
from ..services import require_post, transition

router = APIRouter(prefix="/api", tags=["消息与治理"])


@router.get("/blocks")
def block_list(user=Depends(current_user), db=Depends(get_db_readonly)):
    return [
        public_user(row)
        for row in db.execute(
            "SELECT u.* FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC",
            (user["id"],),
        )
    ]


@router.put("/blocks/{person_id}")
def block_person(person_id: int, user=Depends(student), db=Depends(get_db)):
    if person_id == user["id"]:
        raise HTTPException(422, "不能拉黑自己")
    if not db.execute(
        "SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL", (person_id,)
    ).fetchone():
        raise HTTPException(404, "用户不存在")
    created = db.execute(
        "INSERT OR IGNORE INTO blocks VALUES(?,?,?)", (user["id"], person_id, now())
    ).rowcount
    if created:
        for app in db.execute(
            "SELECT a.* FROM applications a JOIN posts p ON p.id=a.post_id WHERE p.owner_id=? AND a.user_id=? AND a.status='pending'",
            (user["id"], person_id),
        ).fetchall():
            transition(
                db, app, "rejected", "当前申请无法继续，已结束审核。", user["id"]
            )
    return {"ok": True}


@router.delete("/blocks/{person_id}")
def unblock_person(person_id: int, user=Depends(student), db=Depends(get_db)):
    db.execute(
        "DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?",
        (user["id"], person_id),
    )
    return {"ok": True}


@router.post("/reports", status_code=201)
def create_report(data: ReportCreate, user=Depends(student), db=Depends(get_db)):
    post_id = None
    if data.target_type == "post":
        post = require_post(db, data.target_id)
        require_visible(db, post, user)
        subject_id, summary, post_id = post["owner_id"], post["title"], post["id"]
    elif data.target_type == "user":
        target = db.execute(
            "SELECT * FROM users WHERE id=? AND deleted_at IS NULL", (data.target_id,)
        ).fetchone()
        if not target:
            raise HTTPException(404, "用户不存在")
        subject_id, summary = target["id"], target["name"]
    else:
        message = db.execute(
            "SELECT * FROM messages WHERE id=? AND (sender_id=? OR recipient_id=?)",
            (data.target_id, user["id"], user["id"]),
        ).fetchone()
        if (
            not message
            or db.execute(
                "SELECT 1 FROM message_deletions WHERE user_id=? AND message_id=?",
                (user["id"], data.target_id),
            ).fetchone()
        ):
            raise HTTPException(404, "消息不存在或不可举报")
        subject_id, summary = message["sender_id"], f"私信消息 #{message['id']}"
    if subject_id == user["id"]:
        raise HTTPException(422, "不能举报自己的内容")
    old = db.execute(
        "SELECT id FROM reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='pending'",
        (user["id"], data.target_type, data.target_id),
    ).fetchone()
    if old:
        return {"id": old["id"], "status": "pending"}
    report_id = db.execute(
        "INSERT INTO reports(reporter_id,target_type,target_id,subject_user_id,post_id,reason,target_summary,created_at) VALUES(?,?,?,?,?,?,?,?)",
        (
            user["id"],
            data.target_type,
            data.target_id,
            subject_id,
            post_id,
            data.reason,
            summary,
            now(),
        ),
    ).lastrowid
    return {"id": report_id, "status": "pending"}


@router.get("/me/reports")
def own_reports(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(current_user),
    db=Depends(get_db_readonly),
):
    return [
        dict(r)
        for r in db.execute(
            "SELECT id,target_type,target_id,target_summary,status,action,created_at,resolved_at FROM reports WHERE reporter_id=? ORDER BY id DESC LIMIT ? OFFSET ?",
            (user["id"], limit, offset),
        )
    ]


@router.get("/admin/reports")
def reports(
    status: str = "",
    target_type: str = "",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    rows = db.execute(
        "SELECT r.*,u.name AS subject_name FROM reports r JOIN users u ON u.id=r.subject_user_id WHERE (?='' OR r.status=?) AND (?='' OR r.target_type=?) ORDER BY r.id DESC LIMIT ? OFFSET ?",
        (status, status, target_type, target_type, limit, offset),
    ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        if row["target_type"] == "message":
            item["reason"] = "私信举报说明需完成会话访问审计后查看"
            if item["resolution"]:
                item["resolution"] = "处理详情需完成会话访问审计后查看"
            msg = db.execute(
                "SELECT sender_id,recipient_id FROM messages WHERE id=?",
                (row["target_id"],),
            ).fetchone()
            item["conversation"] = dict(msg) if msg else None
        result.append(item)
    return result


@router.post("/admin/reports/{report_id}/resolve")
def resolve_report(
    report_id: int, data: ReportDecision, user=Depends(admin), db=Depends(get_db)
):
    report = db.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
    if not report:
        raise HTTPException(404, "举报不存在")
    if report["status"] != "pending":
        if report["action"] != data.action:
            raise HTTPException(409, "举报已处理，请刷新")
        return {"ok": True}
    if data.action == "ban":
        set_user_ban(
            db, user, report["subject_user_id"], True, data.reason, from_report=True
        )
    elif data.action == "take-down":
        if report["target_type"] != "post":
            raise HTTPException(422, "此举报只能针对用户采取封禁或记录处理")
        set_post_restriction(
            db, user, report["post_id"], True, data.reason, from_report=True
        )
    status = "dismissed" if data.action == "dismiss" else "resolved"
    db.execute(
        "UPDATE reports SET status=?,resolution=?,action=?,admin_id=?,resolved_at=? WHERE id=?",
        (status, data.reason, data.action, user["id"], now(), report_id),
    )
    outcome = {
        "dismiss": "已核实并驳回",
        "resolve": "已核实并记录处理",
        "ban": "已核实并采取账号措施",
        "take-down": "已核实并下架相关招募",
    }[data.action]
    notify(
        db,
        report["reporter_id"],
        f"你的举报 #{report_id} {outcome}。",
        event_key=f"report:{report_id}",
        kind="report",
        target_path="/reports",
    )
    return {"ok": True}


@router.get("/admin/posts")
def moderation_posts(
    q: str = "",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    return [
        dict(r)
        for r in db.execute(
            "SELECT p.id,p.title,p.status,p.end_reason,p.taken_down,p.deadline,p.owner_id,u.name AS owner_name,u.banned,u.deleted_at FROM posts p JOIN users u ON u.id=p.owner_id WHERE instr(p.title,?)>0 ORDER BY p.id DESC LIMIT ? OFFSET ?",
            (q, limit, offset),
        )
    ]


@router.post("/admin/posts/{post_id}/take-down")
def take_down(post_id: int, data: Reason, user=Depends(admin), db=Depends(get_db)):
    set_post_restriction(db, user, post_id, True, data.reason)
    return {"ok": True}


@router.get("/admin/actions")
def moderation_history(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    return [
        dict(r)
        for r in db.execute(
            """SELECT * FROM (
        SELECT id,'user' AS target_type,target_user_id AS target_id,admin_id,action,reason,created_at FROM admin_actions
        UNION ALL SELECT id,'post',post_id,admin_id,action,reason,created_at FROM post_actions
        UNION ALL SELECT id,'post',post_id,admin_id,action,reason,created_at FROM admin_post_actions
    ) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        )
    ]


@router.get("/admin/conversations")
def admin_conversations(
    q: str = "",
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    return [
        dict(r)
        for r in db.execute(
            """SELECT min(sender_id,recipient_id) AS first_user_id,
        max(sender_id,recipient_id) AS second_user_id,u.name AS first_name,v.name AS second_name,
        count(*) AS message_count,max(m.created_at) AS updated_at FROM messages m
        JOIN users u ON u.id=min(sender_id,recipient_id) JOIN users v ON v.id=max(sender_id,recipient_id)
        WHERE (?='' OR instr(u.name,?)>0 OR instr(v.name,?)>0)
        GROUP BY first_user_id,second_user_id ORDER BY updated_at DESC LIMIT ? OFFSET ?""",
            (q, q, q, limit, offset),
        )
    ]


def audited_messages(db, audit, after):
    return [
        dict(r)
        for r in db.execute(
            """SELECT id,sender_id,recipient_id,body,created_at FROM messages
        WHERE id>? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY id LIMIT 200""",
            (
                after,
                audit["first_user_id"],
                audit["second_user_id"],
                audit["second_user_id"],
                audit["first_user_id"],
            ),
        )
    ]


@router.post("/admin/conversations/access")
def open_conversation(
    data: ConversationAccess, user=Depends(admin), db=Depends(get_db)
):
    first, second = sorted((data.first_user_id, data.second_user_id))
    if (
        first == second
        or not db.execute(
            "SELECT 1 FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)",
            (first, second, second, first),
        ).fetchone()
    ):
        raise HTTPException(404, "会话不存在")
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    audit_id = db.execute(
        "INSERT INTO message_access_audits(admin_id,first_user_id,second_user_id,reason,created_at,expires_at) VALUES(?,?,?,?,?,?)",
        (user["id"], first, second, data.reason, now(), expires),
    ).lastrowid
    audit = db.execute(
        "SELECT * FROM message_access_audits WHERE id=?", (audit_id,)
    ).fetchone()
    return {"audit": dict(audit), "messages": audited_messages(db, audit, 0)}


@router.get("/admin/conversations/access/{audit_id}")
def page_conversation(
    audit_id: int,
    after: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    audit = db.execute(
        "SELECT * FROM message_access_audits WHERE id=? AND admin_id=?",
        (audit_id, user["id"]),
    ).fetchone()
    if not audit or audit["expires_at"] <= now():
        raise HTTPException(403, "访问授权已失效，请重新填写原因")
    return audited_messages(db, audit, after)


@router.get("/admin/message-audits")
def access_history(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
):
    return [
        dict(r)
        for r in db.execute(
            "SELECT a.*,u.name AS admin_name FROM message_access_audits a JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
    ]


@router.get("/admin/reports/{report_id}/evidence")
def report_evidence(
    report_id: int, audit_id: int, user=Depends(admin), db=Depends(get_db)
):
    report = db.execute(
        "SELECT * FROM reports WHERE id=? AND target_type='message'", (report_id,)
    ).fetchone()
    audit = db.execute(
        "SELECT * FROM message_access_audits WHERE id=? AND admin_id=?",
        (audit_id, user["id"]),
    ).fetchone()
    if not report or not audit or audit["expires_at"] <= now():
        raise HTTPException(403, "需要有效会话访问授权")
    message = db.execute(
        "SELECT sender_id,recipient_id FROM messages WHERE id=?", (report["target_id"],)
    ).fetchone()
    if not message or sorted((message["sender_id"], message["recipient_id"])) != [
        audit["first_user_id"],
        audit["second_user_id"],
    ]:
        raise HTTPException(403, "授权会话与举报不匹配")
    return {"reason": report["reason"], "resolution": report["resolution"]}
