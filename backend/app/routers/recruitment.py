import json
import base64
import binascii
from datetime import datetime, timedelta, timezone
from pathlib import PurePath
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from ..db import get_db, get_db_readonly, now, notify
from ..auth import optional_user, current_user, student
from ..schemas import PostCreate, PostEdit, ApplicationCreate, Decision, Draft, AttachmentUpload
from ..services import require_post, require_owner, require_open, post_view, decide, legacy_attachment, transition

router = APIRouter(prefix="/api", tags=["招募与申请"])

MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
ATTACHMENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain; charset=utf-8",
}


def attachment_for_post(db, attachment_id, user, post_id=None):
    if attachment_id is None:
        return None
    row = db.execute(
        "SELECT id,post_id FROM attachments WHERE id=? AND owner_id=?",
        (attachment_id, user["id"]),
    ).fetchone()
    if not row or row["post_id"] not in (None, post_id):
        raise HTTPException(422, "附件不存在或已用于其他招募")
    return row


def information_attachment_ids(extras):
    items = extras.get("items", []) if isinstance(extras, dict) else extras.items
    return [
        item["attachment_id"] if isinstance(item, dict) else item.attachment_id
        for item in items if (item.get("type") if isinstance(item, dict) else item.type) == "attachment"
    ]


def validate_attachments(db, extras, user, post_id=None, legacy_id=None):
    ids = information_attachment_ids(extras)
    if legacy_id is not None:
        ids.append(legacy_id)
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "同一附件不能重复用于多个信息项")
    for attachment_id in ids:
        attachment_for_post(db, attachment_id, user, post_id)
    return ids


@router.post("/attachments", status_code=201)
def upload_attachment(data: AttachmentUpload, user=Depends(student), db=Depends(get_db)):
    filename = data.filename.strip()
    if filename in (".", "..") or any(c in filename for c in "/\\\r\n\x00"):
        raise HTTPException(422, "文件名无效")
    suffix = PurePath(filename).suffix.lower()
    if suffix not in ATTACHMENT_TYPES:
        raise HTTPException(422, "仅支持 PDF、DOCX、PNG、JPG 和 TXT 文件")
    try:
        content = base64.b64decode(data.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "文件内容无效")
    if not content or len(content) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(422, "附件大小需在 5 MB 以内")
    if suffix == ".txt":
        try:
            valid = bool(content.decode("utf-8").strip()) and b"\x00" not in content
        except UnicodeDecodeError:
            valid = False
    else:
        valid = (
            content.startswith(b"%PDF-") if suffix == ".pdf" else
            content.startswith(b"PK\x03\x04") if suffix == ".docx" else
            content.startswith(b"\x89PNG\r\n\x1a\n") if suffix == ".png" else
            content.startswith(b"\xff\xd8\xff")
        )
    if not valid:
        raise HTTPException(422, "文件内容与格式不符")
    referenced = set()
    for row in db.execute("SELECT payload FROM drafts WHERE user_id=?", (user["id"],)):
        payload = json.loads(row["payload"])
        if isinstance(payload.get("attachment_id"), int):
            referenced.add(payload["attachment_id"])
        extras = payload.get("extras")
        items = extras.get("items", []) if isinstance(extras, dict) else []
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("attachment_id"), int):
                    referenced.add(item["attachment_id"])
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    for row in db.execute(
        "SELECT id FROM attachments WHERE owner_id=? AND post_id IS NULL AND created_at<?",
        (user["id"], cutoff),
    ).fetchall():
        if row["id"] not in referenced:
            db.execute("DELETE FROM attachments WHERE id=?", (row["id"],))
    attachment_id = db.execute(
        "INSERT INTO attachments(owner_id,filename,content_type,content,created_at) VALUES(?,?,?,?,?)",
        (user["id"], filename, ATTACHMENT_TYPES[suffix], content, now()),
    ).lastrowid
    return {"id": attachment_id, "filename": filename, "size": len(content)}


@router.get("/posts/{post_id}/attachment")
@router.get("/posts/{post_id}/attachments/{attachment_id}")
def download_attachment(post_id: int, attachment_id: int | None = None, db=Depends(get_db)):
    post = require_post(db, post_id)
    if db.execute("SELECT banned FROM users WHERE id=?", (post["owner_id"],)).fetchone()[0]:
        raise HTTPException(404, "此内容暂不可查看")
    if attachment_id is None:
        legacy = legacy_attachment(db, post)
        attachment_id = legacy["id"] if legacy else None
    row = db.execute(
        "SELECT filename,content FROM attachments WHERE post_id=? AND id=?", (post_id, attachment_id)
    ).fetchone()
    if not row:
        raise HTTPException(404, "附件不存在")
    return Response(
        content=row["content"],
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename*=UTF-8''" + quote(row["filename"]),
                 "X-Content-Type-Options": "nosniff"},
    )


@router.get("/categories")
def categories(db=Depends(get_db_readonly)):
    return [r["name"] for r in db.execute("SELECT name FROM categories ORDER BY id")]


@router.get("/post-tags")
def post_tags(db=Depends(get_db)):
    rows = db.execute(
        "SELECT value FROM posts p JOIN users u ON u.id=p.owner_id "
        "JOIN json_each(p.tags) WHERE p.status='open' AND u.banned=0 "
        "AND value<>'' GROUP BY value ORDER BY count(*) DESC,value"
    ).fetchall()
    return [row["value"] for row in rows]


@router.get("/posts")
def posts(
    q: str = "",
    category: str = "",
    tag: str = "",
    sort: str = "latest",
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(optional_user),
    db=Depends(get_db_readonly),
):
    order = (
        "p.deadline ASC,p.id DESC"
        if sort == "deadline"
        else "p.created_at DESC,p.id DESC"
    )
    # 需求变更（待与组长确认）：关闭「公开我的发布」后，该用户的招募从大厅公开列表隐藏；
    # 管理员（is_admin=1）仍能看到全部招募，隐私设置不影响管理员权限。
    is_admin = user["is_admin"] if user else 0
    # Rank tag matches before applying pagination; category only filters results.
    relevance = (
        "CASE WHEN EXISTS (SELECT 1 FROM json_each(p.tags) WHERE lower(value)=lower(?)) THEN 0 "
        "WHEN EXISTS (SELECT 1 FROM json_each(p.tags) WHERE instr(lower(value),lower(?))>0) THEN 1 "
        "ELSE 2 END,"
        if q else ""
    )
    parameters = [is_admin, category, category, tag, tag, q, q]
    if q:
        parameters.extend([q, q])
    parameters.extend([limit, offset])
    rows = db.execute(
        "SELECT p.* FROM posts p JOIN users u ON u.id=p.owner_id WHERE p.status='open' AND u.banned=0 AND (u.public_posts=1 OR ?=1) AND (?='' OR p.category=?) AND (?='' OR EXISTS (SELECT 1 FROM json_each(p.tags) WHERE lower(value)=lower(?))) AND (?='' OR instr(lower(p.title || p.category || p.description || p.tags),lower(?))>0) ORDER BY "
        + relevance + order
        + " LIMIT ? OFFSET ?",
        parameters,
    ).fetchall()
    return [post_view(db, p, user) for p in rows]


@router.get("/posts/{post_id}")
def detail(post_id: int, user=Depends(optional_user), db=Depends(get_db_readonly)):
    post = require_post(db, post_id)
    owner = db.execute(
        "SELECT banned, public_posts FROM users WHERE id=?", (post["owner_id"],)
    ).fetchone()
    if owner["banned"]:
        raise HTTPException(404, "此内容暂不可查看")
    # 需求变更（待与组长确认）：关闭「公开我的发布」后，非本人、非管理员访问详情返回 404（隐藏）；
    # 本人（owner）与管理员（is_admin=1）仍可访问，隐私设置不影响管理员权限。
    is_admin = bool(user and user["is_admin"])
    is_owner = bool(user and user["id"] == post["owner_id"])
    if not owner["public_posts"] and not is_admin and not is_owner:
        raise HTTPException(404, "此内容暂不可查看")
    return post_view(db, post, user)


@router.post("/posts", status_code=201)
def create(data: PostCreate, user=Depends(student), db=Depends(get_db)):
    if not db.execute(
        "SELECT 1 FROM categories WHERE name=?", (data.category,)
    ).fetchone():
        raise HTTPException(422, "请选择系统分类")
    if (
        data.draft_id is not None
        and not db.execute(
            "SELECT 1 FROM drafts WHERE id=? AND user_id=?", (data.draft_id, user["id"])
        ).fetchone()
    ):
        raise HTTPException(404, "草稿不存在")
    attachment_ids = validate_attachments(db, data.extras, user, legacy_id=data.attachment_id)
    created_at = now()
    post_id = db.execute(
        "INSERT INTO posts(owner_id,title,category,description,tags,place,deadline,event_time,extras,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            user["id"],
            data.title,
            data.category,
            data.description,
            json.dumps(data.tags, ensure_ascii=False),
            data.place,
            data.deadline.isoformat(),
            data.event_time,
            data.extras.model_dump_json(),
            created_at,
            created_at,
        ),
    ).lastrowid
    for role in data.roles:
        db.execute(
            "INSERT INTO roles(post_id,name,capacity,description,tags,accepting) VALUES(?,?,?,?,?,?)",
            (
                post_id,
                role.name,
                role.capacity,
                role.description,
                json.dumps(role.tags, ensure_ascii=False),
                role.accepting,
            ),
        )
    for attachment_id in attachment_ids:
        db.execute(
            "UPDATE attachments SET post_id=? WHERE id=?", (post_id, attachment_id)
        )
    if data.draft_id is not None:
        db.execute(
            "DELETE FROM drafts WHERE id=? AND user_id=?", (data.draft_id, user["id"])
        )
    return post_view(db, require_post(db, post_id), user)


@router.patch("/posts/{post_id}")
def edit(post_id: int, data: PostEdit, user=Depends(student), db=Depends(get_db)):
    post = require_post(db, post_id)
    require_owner(post, user)
    fields = data.model_fields_set
    place = data.place if "place" in fields else post["place"]
    tags = data.tags if "tags" in fields else json.loads(post["tags"])
    extras = data.extras if "extras" in fields else json.loads(post["extras"])
    if post["status"] == "ended":
        if (data.title != post["title"] or place != post["place"]
            or tags != json.loads(post["tags"])
            or any(getattr(data, key) is not None for key in ("category", "deadline", "event_time", "roles"))):
            raise HTTPException(409, "已结束招募仅可修正说明、联系方式和补充资料")
    if data.category is not None and not db.execute("SELECT 1 FROM categories WHERE name=?", (data.category,)).fetchone():
        raise HTTPException(422, "请选择系统类别")
    deadline = post["deadline"]
    if data.deadline is not None:
        if data.deadline.tzinfo is None:
            raise HTTPException(422, "截止时间必须包含时区")
        if data.deadline < datetime.fromisoformat(post["deadline"]):
            raise HTTPException(409, "截止时间只允许延长；提前截止请使用结束招募")
        deadline = data.deadline.astimezone(timezone.utc).isoformat()
    if data.roles is not None:
        existing = {row["id"]: row for row in db.execute("SELECT * FROM roles WHERE post_id=?", (post_id,))}
        ids = [role.id for role in data.roles if role.id is not None]
        if len(ids) != len(set(ids)) or any(role_id not in existing for role_id in ids):
            raise HTTPException(422, "岗位不存在、重复或不属于该招募")
        for role_id in set(existing) - set(ids):
            if db.execute("SELECT 1 FROM applications WHERE role_id=?", (role_id,)).fetchone():
                raise HTTPException(409, "有申请记录的岗位不能删除，请停止接收申请")
        for role in data.roles:
            if role.id is None:
                db.execute("INSERT INTO roles(post_id,name,capacity,description,tags,accepting) VALUES(?,?,?,?,?,?)",
                           (post_id, role.name, role.capacity, role.description, json.dumps(role.tags, ensure_ascii=False), role.accepting))
                continue
            old = existing[role.id]
            accepted = db.execute("SELECT count(*) FROM applications WHERE role_id=? AND status='accepted'", (role.id,)).fetchone()[0]
            if role.capacity < accepted:
                raise HTTPException(409, "招募人数不能低于已录取人数")
            changed = (role.name != old["name"] or role.description != old["description"]
                       or role.tags != json.loads(old["tags"]) or role.capacity != old["capacity"]
                       or role.accepting != bool(old["accepting"]))
            db.execute("UPDATE roles SET name=?,capacity=?,description=?,tags=?,accepting=? WHERE id=?",
                       (role.name, role.capacity, role.description, json.dumps(role.tags, ensure_ascii=False), role.accepting, role.id))
            if changed:
                for row in db.execute("SELECT DISTINCT user_id FROM applications WHERE role_id=?", (role.id,)):
                    notify(db, row["user_id"], f"岗位「{old['name']}」信息已更新，请查看最新岗位要求与名额。", post_id)
            if accepted == role.capacity:
                for application in db.execute("SELECT * FROM applications WHERE role_id=? AND status='pending'", (role.id,)).fetchall():
                    transition(db, application, "rejected", "岗位名额已满", user["id"])
        for role_id in set(existing) - set(ids):
            db.execute("DELETE FROM roles WHERE id=?", (role_id,))
        roles_left = db.execute(
            "SELECT count(*) FROM roles WHERE post_id=?", (post_id,)
        ).fetchone()[0]
        if roles_left and not db.execute("SELECT 1 FROM roles r WHERE r.post_id=? AND r.capacity>(SELECT count(*) FROM applications a WHERE a.role_id=r.id AND a.status='accepted')", (post_id,)).fetchone():
            db.execute("UPDATE posts SET status='ended',end_reason='filled' WHERE id=?", (post_id,))
            notify(db, user["id"], "全部岗位已满，招募结束，结果已锁定。", post_id)
    event_time = data.event_time if data.event_time is not None else post["event_time"]
    if place != post["place"] or event_time != post["event_time"] or deadline != post["deadline"]:
        for row in db.execute("SELECT DISTINCT user_id FROM applications WHERE post_id=? AND status IN ('pending','accepted')", (post_id,)):
            notify(db, row["user_id"], "活动时间、地点或招募截止时间已变更，请查看最新安排。", post_id)
    old_attachment = legacy_attachment(db, post)
    attachment_id = (
        data.attachment_id if "attachment_id" in data.model_fields_set
        else old_attachment["id"] if old_attachment else None
    )
    attachment_ids = validate_attachments(db, extras, user, post_id, attachment_id)
    for row in db.execute("SELECT id FROM attachments WHERE post_id=?", (post_id,)).fetchall():
        if row["id"] not in attachment_ids:
            db.execute("DELETE FROM attachments WHERE id=?", (row["id"],))
    for attachment_id in attachment_ids:
        db.execute(
            "UPDATE attachments SET post_id=? WHERE id=?", (post_id, attachment_id)
        )
    db.execute(
        "UPDATE posts SET title=?,description=?,place=?,tags=?,extras=?,updated_at=?,category=?,deadline=?,event_time=? WHERE id=?",
        (
            data.title,
            data.description,
            place,
            json.dumps(tags, ensure_ascii=False),
            extras.model_dump_json() if "extras" in fields else post["extras"],
            now(),
            data.category if data.category is not None else post["category"],
            deadline,
            event_time,
            post_id,
        ),
    )
    return post_view(db, require_post(db, post_id), user)


@router.delete("/posts/{post_id}")
def delete(post_id: int, user=Depends(student), db=Depends(get_db)):
    post = require_post(db, post_id)
    require_owner(post, user)
    if db.execute("SELECT 1 FROM applications WHERE post_id=?", (post_id,)).fetchone():
        raise HTTPException(409, "已有申请历史，不能删除")
    db.execute("DELETE FROM posts WHERE id=?", (post_id,))
    return {"ok": True}


@router.post("/posts/{post_id}/copy-draft", status_code=201)
def copy_draft(post_id: int, user=Depends(student), db=Depends(get_db)):
    post = require_post(db, post_id)
    require_owner(post, user)
    payload = {key: post[key] for key in ("title", "category", "description", "place")}
    payload.update(tags=json.loads(post["tags"]), extras=json.loads(post["extras"]), deadline="", event_time="")
    ids = {}
    for row in db.execute("SELECT * FROM attachments WHERE post_id=?", (post_id,)).fetchall():
        ids[row["id"]] = db.execute(
            "INSERT INTO attachments(owner_id,filename,content_type,content,created_at) VALUES(?,?,?,?,?)",
            (user["id"], row["filename"], row["content_type"], row["content"], now()),
        ).lastrowid
    legacy = legacy_attachment(db, post)
    payload["attachment_id"] = ids.get(legacy["id"]) if legacy else None
    payload["attachment_name"] = legacy["filename"] if legacy else ""
    for item in payload["extras"].get("items", []):
        if item["type"] == "attachment":
            item["attachment_id"] = ids[item["attachment_id"]]
    payload["roles"] = [{"name": role["name"], "capacity": role["capacity"], "description": role["description"],
                         "tags": json.loads(role["tags"]), "accepting": True}
                        for role in db.execute("SELECT * FROM roles WHERE post_id=? ORDER BY id", (post_id,))]
    draft_id = db.execute("INSERT INTO drafts(user_id,payload,updated_at) VALUES(?,?,?)",
                          (user["id"], json.dumps(payload, ensure_ascii=False), now())).lastrowid
    return {"id": draft_id}


@router.post("/posts/{post_id}/end")
def end(post_id: int, user=Depends(student), db=Depends(get_db)):
    post = require_post(db, post_id)
    require_owner(post, user)
    require_open(post)
    # TD-03 is unresolved: do not silently invent a terminal state for pending apps.
    if db.execute(
        "SELECT 1 FROM applications WHERE post_id=? AND status='pending'", (post_id,)
    ).fetchone():
        raise HTTPException(409, "请先处理待审核申请，再提前结束招募")
    db.execute(
        "UPDATE posts SET status='ended',end_reason='manual' WHERE id=?", (post_id,)
    )
    for row in db.execute(
        "SELECT DISTINCT user_id FROM applications WHERE post_id=?", (post_id,)
    ):
        notify(db, row["user_id"], "发布者提前结束了招募，结果已锁定。", post_id)
    return {"ok": True}


@router.get("/me/posts")
def mine(user=Depends(current_user), db=Depends(get_db_readonly)):
    return [
        post_view(db, p, user)
        for p in db.execute(
            "SELECT * FROM posts WHERE owner_id=? ORDER BY id DESC", (user["id"],)
        )
    ]


@router.post("/posts/{post_id}/applications", status_code=201)
def apply(
    post_id: int, data: ApplicationCreate, user=Depends(student), db=Depends(get_db)
):
    post = require_post(db, post_id)
    require_open(post)
    if post["owner_id"] == user["id"]:
        raise HTTPException(409, "不能申请自己的招募")
    if db.execute(
        "SELECT banned FROM users WHERE id=?", (post["owner_id"],)
    ).fetchone()[0]:
        raise HTTPException(409, "招募当前不可申请")
    if not db.execute(
        "SELECT 1 FROM roles WHERE post_id=?", (post_id,)
    ).fetchone():
        raise HTTPException(409, "该招募未设置岗位，无法申请")
    role = db.execute(
        "SELECT * FROM roles WHERE id=? AND post_id=?", (data.role_id, post_id)
    ).fetchone()
    if not role:
        raise HTTPException(404, "岗位不存在")
    if not role["accepting"]:
        raise HTTPException(409, "该岗位已停止接收申请")
    if db.execute(
        "SELECT 1 FROM applications WHERE post_id=? AND user_id=? AND (status='accepted' OR (role_id=? AND status='pending'))",
        (post_id, user["id"], role["id"]),
    ).fetchone():
        raise HTTPException(409, "已申请此岗位或已被该招募录取")
    count = db.execute(
        "SELECT count(*) FROM applications WHERE role_id=? AND status='accepted'",
        (role["id"],),
    ).fetchone()[0]
    if count >= role["capacity"]:
        raise HTTPException(409, "岗位已满")
    app_id = db.execute(
        "INSERT INTO applications(post_id,role_id,user_id,message,experience,portfolio,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        (
            post_id,
            role["id"],
            user["id"],
            data.message,
            data.experience,
            data.portfolio,
            now(),
            now(),
        ),
    ).lastrowid
    db.execute(
        "INSERT INTO application_events(application_id,actor_id,status,reason,created_at) VALUES(?,?,?,?,?)",
        (app_id, user["id"], "pending", "提交申请", now()),
    )
    notify(
        db, post["owner_id"], user["name"] + "申请了「" + role["name"] + "」。", post_id
    )
    return {"id": app_id, "status": "pending"}


def application_rows(db, where, args):
    rows = db.execute(
        "SELECT a.*,r.name AS role_name,p.title,p.status AS post_status,u.name AS applicant_name FROM applications a JOIN roles r ON r.id=a.role_id JOIN posts p ON p.id=a.post_id JOIN users u ON u.id=a.user_id WHERE "
        + where
        + " ORDER BY a.id DESC",
        args,
    ).fetchall()
    return [
        {
            **dict(row),
            "events": [
                dict(e)
                for e in db.execute(
                    "SELECT status,reason,created_at FROM application_events WHERE application_id=? ORDER BY id",
                    (row["id"],),
                )
            ],
        }
        for row in rows
    ]


@router.get("/posts/{post_id}/applications")
def applicants(post_id: int, user=Depends(current_user), db=Depends(get_db_readonly)):
    require_owner(require_post(db, post_id), user)
    return application_rows(db, "a.post_id=?", (post_id,))


@router.get("/me/applications")
def my_applications(user=Depends(current_user), db=Depends(get_db_readonly)):
    return application_rows(db, "a.user_id=?", (user["id"],))


@router.post("/applications/{app_id}/decision")
def decision(app_id: int, data: Decision, user=Depends(student), db=Depends(get_db)):
    decide(db, app_id, user, data.action, data.reason)
    return {"ok": True}


@router.get("/me/favorites")
def favorites(user=Depends(current_user), db=Depends(get_db_readonly)):
    return [
        post_view(db, p, user)
        for p in db.execute(
            "SELECT p.* FROM posts p JOIN favorites f ON f.post_id=p.id JOIN users u ON u.id=p.owner_id WHERE f.user_id=? AND u.banned=0 ORDER BY p.id DESC",
            (user["id"],),
        )
    ]


@router.put("/posts/{post_id}/favorite")
def favorite(post_id: int, user=Depends(student), db=Depends(get_db)):
    require_post(db, post_id)
    db.execute("INSERT OR IGNORE INTO favorites VALUES(?,?)", (user["id"], post_id))
    return {"ok": True}


@router.delete("/posts/{post_id}/favorite")
def unfavorite(post_id: int, user=Depends(student), db=Depends(get_db)):
    db.execute(
        "DELETE FROM favorites WHERE user_id=? AND post_id=?", (user["id"], post_id)
    )
    return {"ok": True}


@router.get("/drafts")
def drafts(user=Depends(current_user), db=Depends(get_db_readonly)):
    return [
        {**dict(d), "payload": json.loads(d["payload"])}
        for d in db.execute(
            "SELECT * FROM drafts WHERE user_id=? ORDER BY updated_at DESC",
            (user["id"],),
        )
    ]


def draft_payload(data):
    value = json.dumps(data.payload, ensure_ascii=False)
    if len(value) > 60000:
        raise HTTPException(422, "草稿内容过长")
    return value


@router.post("/drafts", status_code=201)
def save_draft(data: Draft, user=Depends(student), db=Depends(get_db)):
    draft_id = db.execute(
        "INSERT INTO drafts(user_id,payload,updated_at) VALUES(?,?,?)",
        (user["id"], draft_payload(data), now()),
    ).lastrowid
    return {"id": draft_id}


@router.put("/drafts/{draft_id}")
def update_draft(draft_id: int, data: Draft, user=Depends(student), db=Depends(get_db)):
    if not db.execute(
        "UPDATE drafts SET payload=?,updated_at=? WHERE id=? AND user_id=?",
        (draft_payload(data), now(), draft_id, user["id"]),
    ).rowcount:
        raise HTTPException(404, "草稿不存在")
    return {"id": draft_id}


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: int, user=Depends(student), db=Depends(get_db)):
    if not db.execute(
        "DELETE FROM drafts WHERE id=? AND user_id=?", (draft_id, user["id"])
    ).rowcount:
        raise HTTPException(404, "草稿不存在")
    return {"ok": True}
