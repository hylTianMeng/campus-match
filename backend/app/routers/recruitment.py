import json
from fastapi import APIRouter, Depends, HTTPException, Query
from ..db import get_db, now, notify
from ..auth import optional_user, current_user, student
from ..schemas import PostCreate, PostEdit, ApplicationCreate, Decision, Draft
from ..services import require_post, require_owner, require_open, post_view, decide

router = APIRouter(prefix="/api", tags=["招募与申请"])


@router.get("/categories")
def categories(db=Depends(get_db)):
    return [r["name"] for r in db.execute("SELECT name FROM categories ORDER BY id")]


@router.get("/posts")
def posts(
    q: str = "",
    category: str = "",
    sort: str = "latest",
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(optional_user),
    db=Depends(get_db),
):
    order = (
        "p.deadline ASC,p.id DESC"
        if sort == "deadline"
        else "p.created_at DESC,p.id DESC"
    )
    rows = db.execute(
        "SELECT p.* FROM posts p JOIN users u ON u.id=p.owner_id WHERE p.status='open' AND u.banned=0 AND (?='' OR p.category=?) AND (?='' OR instr(lower(p.title || p.category || p.description || p.tags),lower(?))>0) ORDER BY "
        + order
        + " LIMIT ? OFFSET ?",
        (category, category, q, q, limit, offset),
    ).fetchall()
    return [post_view(db, p, user) for p in rows]


@router.get("/posts/{post_id}")
def detail(post_id: int, user=Depends(optional_user), db=Depends(get_db)):
    post = require_post(db, post_id)
    if db.execute(
        "SELECT banned FROM users WHERE id=?", (post["owner_id"],)
    ).fetchone()[0]:
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
    post_id = db.execute(
        "INSERT INTO posts(owner_id,title,category,description,tags,place,deadline,event_time,extras,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
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
            now(),
        ),
    ).lastrowid
    for role in data.roles:
        db.execute(
            "INSERT INTO roles(post_id,name,capacity,description,tags) VALUES(?,?,?,?,?)",
            (
                post_id,
                role.name,
                role.capacity,
                role.description,
                json.dumps(role.tags, ensure_ascii=False),
            ),
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
    require_open(post)
    db.execute(
        "UPDATE posts SET title=?,description=?,place=?,tags=?,extras=? WHERE id=?",
        (
            data.title,
            data.description,
            data.place,
            json.dumps(data.tags, ensure_ascii=False),
            data.extras.model_dump_json(),
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
def mine(user=Depends(current_user), db=Depends(get_db)):
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
    role = db.execute(
        "SELECT * FROM roles WHERE id=? AND post_id=?", (data.role_id, post_id)
    ).fetchone()
    if not role:
        raise HTTPException(404, "岗位不存在")
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
def applicants(post_id: int, user=Depends(current_user), db=Depends(get_db)):
    require_owner(require_post(db, post_id), user)
    return application_rows(db, "a.post_id=?", (post_id,))


@router.get("/me/applications")
def my_applications(user=Depends(current_user), db=Depends(get_db)):
    return application_rows(db, "a.user_id=?", (user["id"],))


@router.post("/applications/{app_id}/decision")
def decision(app_id: int, data: Decision, user=Depends(student), db=Depends(get_db)):
    decide(db, app_id, user, data.action, data.reason)
    return {"ok": True}


@router.get("/me/favorites")
def favorites(user=Depends(current_user), db=Depends(get_db)):
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
def drafts(user=Depends(current_user), db=Depends(get_db)):
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
