import hashlib
import hmac
import json
import secrets
from fastapi import Depends, HTTPException, Request
from .db import get_db_reader, get_db, now


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 600_000
    ).hex()
    return salt + ":" + digest


def verify_password(password, stored):
    salt, expected = stored.split(":")
    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 600_000
    ).hex()
    return hmac.compare_digest(actual, expected)


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def optional_user(request: Request, db=Depends(get_db_reader)):
    token = request.cookies.get("campus_session")
    if not token:
        return None
    return db.execute(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.deleted_at IS NULL",
        (token_hash(token), now()),
    ).fetchone()


def current_user(user=Depends(optional_user)):
    if user is None:
        raise HTTPException(401, "请先登录")
    return user


def student(user=Depends(current_user), db=Depends(get_db)):
    # Recheck inside the write transaction after waiting for concurrent moderation.
    user = db.execute(
        "SELECT * FROM users WHERE id=? AND deleted_at IS NULL", (user["id"],)
    ).fetchone()
    if user is None:
        raise HTTPException(401, "登录已失效")
    if not user["verified"]:
        raise HTTPException(403, "请先完成校园认证")
    if user["banned"]:
        raise HTTPException(403, "账号当前只读")
    return user


def admin(user=Depends(current_user), db=Depends(get_db)):
    user = db.execute(
        "SELECT * FROM users WHERE id=? AND deleted_at IS NULL", (user["id"],)
    ).fetchone()
    if user is None:
        raise HTTPException(401, "登录已失效")
    if not user["is_admin"]:
        raise HTTPException(403, "需要管理员权限")
    if user["banned"]:
        raise HTTPException(403, "管理员账号当前只读")
    return user


def avatar_url(user):
    return f"/api/users/{user['id']}/avatar" if user["avatar_path"] else None


def public_user(user):
    return {
        **{k: user[k] for k in ("id", "name", "dept", "year", "bio")},
        "tags": json.loads(user["tags"]),
        "avatar_url": avatar_url(user),
    }


def own_user(user):
    return {
        **public_user(user),
        **{
            k: user[k]
            for k in (
                "email",
                "verified",
                "banned",
                "searchable",
                "public_posts",
                "public_teams",
            )
        },
        "is_admin": bool(user["is_admin"]),
    }
