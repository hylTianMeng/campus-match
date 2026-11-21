import os
import secrets
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from ..db import get_db, now
from ..auth import (
    current_user,
    student,
    own_user,
    hash_password,
    verify_password,
    token_hash,
)
from ..schemas import Login, Profile, ChangePassword, AttachmentUpload
from ..attachments import decode_attachment

router = APIRouter(prefix="/api/auth", tags=["账户"])
DUMMY_HASH = hash_password("constant-time-fallback")


def start_session(db, response: Response, user):
    """Create a session row and set the httponly session cookie for a user."""
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    db.execute("DELETE FROM sessions WHERE expires_at<=?", (now(),))
    db.execute(
        "INSERT INTO sessions VALUES(?,?,?)", (token_hash(token), user["id"], expires)
    )
    response.set_cookie(
        "campus_session",
        token,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "0") == "1",
        max_age=604800,
        path="/",
    )


@router.post("/login")
def login(data: Login, response: Response, db=Depends(get_db)):
    email = data.email.lower()
    attempt = db.execute(
        "SELECT * FROM login_attempts WHERE email=?", (email,)
    ).fetchone()
    if attempt and attempt["reset_at"] > now() and attempt["attempts"] >= 10:
        raise HTTPException(429, "尝试次数过多，请 15 分钟后再试")
    user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if user and user["deleted_at"]:
        raise HTTPException(401, "该账号已注销")
    valid = verify_password(
        data.password, user["password_hash"] if user else DUMMY_HASH
    )
    if not user or not valid:
        reset = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        count = (
            attempt["attempts"] + 1 if attempt and attempt["reset_at"] > now() else 1
        )
        db.execute(
            "INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)",
            (email, count, attempt["reset_at"] if count > 1 else reset),
        )
        db.commit()  # Persist failed attempts even though the request raises.
        raise HTTPException(401, "邮箱或密码错误")
    db.execute("DELETE FROM login_attempts WHERE email=?", (email,))
    start_session(db, response, user)
    return own_user(user)


@router.post("/logout")
def logout(request: Request, response: Response, db=Depends(get_db)):
    db.execute(
        "DELETE FROM sessions WHERE token_hash=?",
        (token_hash(request.cookies.get("campus_session", "")),),
    )
    response.delete_cookie("campus_session", path="/")
    return {"ok": True}


@router.get("/me")
def me(user=Depends(current_user)):
    return own_user(user)


@router.post("/password")
def change_password(
    data: ChangePassword,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_db),
):
    """修改登录密码：校验旧密码，更新为新密码，并使其他设备的会话失效。

    保留当前会话（当前设备继续登录），删除该用户其他所有 session，防止旧密码
    泄露后其他已登录设备仍可继续操作。
    """
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(401, "当前密码错误")
    db.execute(
        "UPDATE users SET password_hash=? WHERE id=?",
        (hash_password(data.new_password), user["id"]),
    )
    current_token_hash = token_hash(request.cookies.get("campus_session", ""))
    db.execute(
        "DELETE FROM sessions WHERE user_id=? AND token_hash<>?",
        (user["id"], current_token_hash),
    )
    return {"ok": True}


@router.patch("/me")
def update_profile(data: Profile, user=Depends(student), db=Depends(get_db)):
    if data.resources is not None:
        resources = []
        ids = set()
        for item in data.resources:
            resource = item.model_dump()
            if item.type == "attachment":
                row = db.execute(
                    "SELECT filename FROM profile_attachments WHERE id=? AND owner_id=?",
                    (item.attachment_id, user["id"]),
                ).fetchone()
                if not row or item.attachment_id in ids:
                    raise HTTPException(422, "附件不存在、无权使用或被重复引用")
                ids.add(item.attachment_id)
                resource["filename"] = row["filename"]
            resources.append(resource)
        previous_ids = {
            item["attachment_id"] for item in json.loads(user["resources"])
            if item["type"] == "attachment"
        }
        for attachment_id in previous_ids - ids:
            db.execute("DELETE FROM profile_attachments WHERE id=? AND owner_id=?", (attachment_id, user["id"]))
        db.execute("UPDATE users SET resources=? WHERE id=?", (json.dumps(resources, ensure_ascii=False), user["id"]))
    db.execute(
        "UPDATE users SET name=?,dept=?,year=?,bio=?,tags=?,searchable=?,public_posts=?,public_teams=? WHERE id=?",
        (
            data.name,
            data.dept,
            data.year,
            data.bio,
            json.dumps(data.tags, ensure_ascii=False),
            data.searchable,
            data.public_posts,
            data.public_teams,
            user["id"],
        ),
    )
    return own_user(
        db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    )


@router.post("/me/attachments", status_code=201)
def upload_profile_attachment(data: AttachmentUpload, user=Depends(student), db=Depends(get_db)):
    filename, content_type, content = decode_attachment(data)
    saved_ids = {
        item["attachment_id"] for item in json.loads(user["resources"])
        if item["type"] == "attachment"
    }
    cutoff = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    for row in db.execute(
        "SELECT id FROM profile_attachments WHERE owner_id=? AND created_at<?", (user["id"], cutoff)
    ).fetchall():
        if row["id"] not in saved_ids:
            db.execute("DELETE FROM profile_attachments WHERE id=?", (row["id"],))
    attachment_id = db.execute(
        "INSERT INTO profile_attachments(owner_id,filename,content_type,content,created_at) VALUES(?,?,?,?,?)",
        (user["id"], filename, content_type, content, now()),
    ).lastrowid
    return {"id": attachment_id, "filename": filename, "size": len(content)}
