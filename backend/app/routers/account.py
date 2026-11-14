"""Account management: register, campus verification, password reset, avatar, and self-deletion."""

import secrets
import sqlite3
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse

from ..auth import current_user, student, own_user, hash_password, verify_password
from ..db import get_db, get_db_readonly, now
from ..emailing import SMTP_ENABLED, hash_code, is_campus_email, make_code, send_code
from ..schemas import Register, ResetPassword, ResetRequest, VerifyCode, DeleteAccount
from .auth import start_session

router = APIRouter(prefix="/api", tags=["账户"])

AVATAR_DIR = Path(__file__).resolve().parents[1] / "static" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

MAX_AVATAR_BYTES = 2 * 1024 * 1024
CODE_TTL_MINUTES = 10
CODE_MAX_ATTEMPTS = 5
CODE_COOLDOWN_SECONDS = 60

_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def _ext_from_magic(data: bytes) -> str:
    """Derive the file extension from the image magic bytes, never from user input."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "gif"
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return "webp"
    return ""


def _cooldown_active(db, email, purpose):
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=CODE_COOLDOWN_SECONDS)).isoformat()
    return db.execute(
        "SELECT 1 FROM email_codes WHERE email=? AND purpose=? AND consumed=0 AND created_at>=?",
        (email, purpose, cutoff),
    ).fetchone()


def _insert_code(db, email, purpose, user_id):
    code = make_code()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)).isoformat()
    db.execute(
        "INSERT INTO email_codes(email,purpose,code_hash,user_id,expires_at,attempts,consumed,created_at) VALUES(?,?,?,?,?,0,0,?)",
        (email, purpose, hash_code(code), user_id, expires, now()),
    )
    return code


def _consume_code(db, email, purpose, code):
    """Validate and consume the latest code for ``email``/``purpose``.

    Raises 410 when missing/expired, 429 after too many attempts, and 400 on a
    wrong code. On success the row is marked consumed and returned.
    """
    row = db.execute(
        "SELECT * FROM email_codes WHERE email=? AND purpose=? AND consumed=0 ORDER BY id DESC LIMIT 1",
        (email, purpose),
    ).fetchone()
    if not row or row["expires_at"] <= now():
        raise HTTPException(410, "验证码已过期，请重新获取")
    if row["attempts"] >= CODE_MAX_ATTEMPTS:
        raise HTTPException(429, "尝试次数过多，请重新获取")
    if row["code_hash"] != hash_code(code):
        db.execute(
            "UPDATE email_codes SET attempts=attempts+1 WHERE id=?", (row["id"],)
        )
        # 关键：先 commit，否则 get_db 在异常时 rollback 会把 attempts 自增回滚掉，
        # 导致验证码错误次数累计失效（防爆破失效）。
        db.commit()
        raise HTTPException(400, "验证码错误")
    db.execute("UPDATE email_codes SET consumed=1 WHERE id=?", (row["id"],))
    return row


@router.post("/auth/register", status_code=201)
def register(data: Register, response: Response, db=Depends(get_db)):
    email = data.email.lower().strip()
    if not is_campus_email(email):
        raise HTTPException(422, "仅支持校园邮箱注册")
    try:
        user_id = db.execute(
            "INSERT INTO users(email,password_hash,name,verified) VALUES(?,?,?,0)",
            (email, hash_password(data.password), data.name),
        ).lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "该邮箱已注册")
    user = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    start_session(db, response, user)
    return own_user(user)


@router.post("/auth/verify/send")
def send_verify(user=Depends(current_user), db=Depends(get_db)):
    if user["verified"]:
        raise HTTPException(409, "已完成校园认证")
    email = user["email"]
    if _cooldown_active(db, email, "verify"):
        raise HTTPException(429, "请稍后再试")
    code = _insert_code(db, email, "verify", user["id"])
    send_code(email, code, "verify")
    result = {"ok": True}
    if not SMTP_ENABLED:
        result["dev_code"] = code
    return result


@router.post("/auth/verify/check")
def check_verify(data: VerifyCode, user=Depends(current_user), db=Depends(get_db)):
    if user["banned"]:
        raise HTTPException(403, "账号当前只读")
    if user["verified"]:
        raise HTTPException(409, "已完成校园认证")
    _consume_code(db, user["email"], "verify", data.code)
    db.execute("UPDATE users SET verified=1 WHERE id=?", (user["id"],))
    return own_user(db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone())


@router.post("/auth/reset/request")
def reset_request(data: ResetRequest, db=Depends(get_db)):
    email = data.email.lower().strip()
    user = db.execute(
        "SELECT * FROM users WHERE email=? AND deleted_at IS NULL", (email,)
    ).fetchone()
    result = {"ok": True}
    if not SMTP_ENABLED:
        result["dev_code"] = ""
    if not user:
        # Do not reveal whether the mailbox exists; still return 200.
        return result
    if _cooldown_active(db, email, "reset"):
        raise HTTPException(429, "请稍后再试")
    code = _insert_code(db, email, "reset", user["id"])
    send_code(email, code, "reset")
    if not SMTP_ENABLED:
        result["dev_code"] = code
    return result


@router.post("/auth/reset/confirm")
def reset_confirm(data: ResetPassword, db=Depends(get_db)):
    email = data.email.lower().strip()
    user = db.execute(
        "SELECT * FROM users WHERE email=? AND deleted_at IS NULL", (email,)
    ).fetchone()
    if not user:
        raise HTTPException(410, "验证码已过期，请重新获取")
    _consume_code(db, email, "reset", data.code)
    db.execute(
        "UPDATE users SET password_hash=? WHERE id=?",
        (hash_password(data.password), user["id"]),
    )
    db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    return {"ok": True}


@router.post("/auth/avatar")
def upload_avatar(file: UploadFile = File(...), user=Depends(student), db=Depends(get_db)):
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(415, "仅支持 PNG、JPEG、WEBP、GIF 图片")
    data = file.file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(413, "头像大小不能超过 2MB")
    ext = _ext_from_magic(data)
    if not ext:
        raise HTTPException(422, "图片内容校验失败，请重新选择文件")

    filename = f"{user['id']}-{int(time.time())}-{secrets.token_hex(4)}.{ext}"
    (AVATAR_DIR / filename).write_bytes(data)
    old = user["avatar_path"]
    if old and old != filename:
        (AVATAR_DIR / old).unlink(missing_ok=True)
    db.execute("UPDATE users SET avatar_path=? WHERE id=?", (filename, user["id"]))
    return own_user(db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone())


@router.delete("/auth/avatar")
def remove_avatar(user=Depends(student), db=Depends(get_db)):
    """Clear the caller's avatar: unlink the file and reset ``avatar_path``."""
    if user["avatar_path"]:
        (AVATAR_DIR / user["avatar_path"]).unlink(missing_ok=True)
    db.execute("UPDATE users SET avatar_path='' WHERE id=?", (user["id"],))
    return own_user(db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone())


@router.get("/users/{user_id}/avatar")
def read_avatar(user_id: int, db=Depends(get_db_readonly)):
    row = db.execute(
        "SELECT avatar_path FROM users WHERE id=? AND deleted_at IS NULL", (user_id,)
    ).fetchone()
    if not row or not row["avatar_path"]:
        raise HTTPException(404, "头像不存在")
    path = AVATAR_DIR / row["avatar_path"]
    if not path.is_file():
        raise HTTPException(404, "头像不存在")
    return FileResponse(path)


@router.post("/auth/delete")
def delete_account(
    data: DeleteAccount, response: Response, user=Depends(current_user), db=Depends(get_db)
):
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "密码错误")
    db.execute(
        "UPDATE users SET deleted_at=?,email=?,password_hash=?,name=?,dept=?,year=?,bio=?,tags=?,verified=0,banned=0,searchable=0,public_posts=0,public_teams=0,avatar_path='' WHERE id=?",
        (
            now(),
            f"deleted+{user['id']}@deleted.invalid",
            hash_password(secrets.token_urlsafe(32)),
            "已注销用户",
            "",
            "",
            "",
            "[]",
            user["id"],
        ),
    )
    if user["avatar_path"]:
        (AVATAR_DIR / user["avatar_path"]).unlink(missing_ok=True)
    db.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
    response.delete_cookie("campus_session", path="/")
    return {"ok": True}
