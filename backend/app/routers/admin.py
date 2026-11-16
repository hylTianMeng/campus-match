"""Administrator endpoints for user management (list / ban / unban)."""

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import admin
from ..db import get_db, get_db_readonly, now, notify
from ..schemas import BanUser, UnbanUser, TakedownPost

router = APIRouter(prefix="/api/admin", tags=["管理"])


def _avatar_url(user):
    return f"/api/users/{user['id']}/avatar" if user["avatar_path"] else None


def _require_post(db, post_id):
    post = db.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    if not post:
        raise HTTPException(404, "招募不存在")
    return post


@router.get("/users")
def list_users(
    q: str = "",
    banned: str = "",
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db_readonly),
):
    rows = db.execute(
        "SELECT * FROM users WHERE (?='' OR instr(name,?)>0 OR instr(email,?)>0) AND (?='' OR banned=?) ORDER BY id LIMIT ? OFFSET ?",
        (q, q, q, banned, banned, limit, offset),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "email": r["email"],
            "name": r["name"],
            "dept": r["dept"],
            "year": r["year"],
            "verified": bool(r["verified"]),
            "banned": bool(r["banned"]),
            "is_admin": bool(r["is_admin"]),
            "avatar_url": _avatar_url(r),
        }
        for r in rows
    ]


@router.post("/users/{user_id}/ban")
def ban_user(user_id: int, data: BanUser, user=Depends(admin), db=Depends(get_db)):
    target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target:
        raise HTTPException(404, "用户不存在")
    if target["id"] == user["id"]:
        raise HTTPException(409, "不能封禁自己")
    if target["is_admin"]:
        raise HTTPException(403, "不能封禁管理员账号")
    db.execute("UPDATE users SET banned=1 WHERE id=?", (user_id,))
    db.execute(
        "INSERT INTO admin_actions(admin_id,target_user_id,action,reason,created_at) VALUES(?,?,?,?,?)",
        (user["id"], user_id, "ban", data.reason, now()),
    )
    notify(db, user_id, "你的账号已被封禁。", None)
    return {"ok": True}


@router.post("/users/{user_id}/unban")
def unban_user(user_id: int, data: UnbanUser, user=Depends(admin), db=Depends(get_db)):
    target = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not target:
        raise HTTPException(404, "用户不存在")
    db.execute("UPDATE users SET banned=0 WHERE id=?", (user_id,))
    db.execute(
        "INSERT INTO admin_actions(admin_id,target_user_id,action,reason,created_at) VALUES(?,?,?,?,?)",
        (user["id"], user_id, "unban", data.reason, now()),
    )
    notify(db, user_id, "你的账号已解封。", None)
    return {"ok": True}


@router.post("/posts/{post_id}/takedown")
def takedown_post(post_id: int, data: TakedownPost, user=Depends(admin), db=Depends(get_db)):
    post = _require_post(db, post_id)
    if post["status"] != "open":
        raise HTTPException(409, "仅招募中的招募可以下架")
    db.execute(
        "UPDATE posts SET status='ended',end_reason='taken_down' WHERE id=?", (post_id,)
    )
    db.execute(
        "INSERT INTO admin_post_actions(admin_id,post_id,action,reason,created_at) VALUES(?,?,?,?,?)",
        (user["id"], post_id, "takedown", data.reason, now()),
    )
    notify(db, post["owner_id"], f"您的「{post['title']}」招募已被下架，原因是：{data.reason}", post_id)
    return {"ok": True}


@router.post("/posts/{post_id}/restore")
def restore_post(post_id: int, user=Depends(admin), db=Depends(get_db)):
    post = _require_post(db, post_id)
    if post["end_reason"] != "taken_down":
        raise HTTPException(409, "该招募未被下架，无需恢复")
    db.execute(
        "UPDATE posts SET status='open',end_reason=NULL WHERE id=?", (post_id,)
    )
    db.execute(
        "INSERT INTO admin_post_actions(admin_id,post_id,action,reason,created_at) VALUES(?,?,?,?,?)",
        (user["id"], post_id, "restore", "", now()),
    )
    notify(db, post["owner_id"], f"您的「{post['title']}」招募已恢复上架。", post_id)
    return {"ok": True}
