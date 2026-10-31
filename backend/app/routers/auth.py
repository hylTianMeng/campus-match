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
from ..schemas import Login, Profile

router = APIRouter(prefix="/api/auth", tags=["账户"])
DUMMY_HASH = hash_password("constant-time-fallback")


@router.post("/login")
def login(data: Login, response: Response, db=Depends(get_db)):
    email = data.email.lower()
    attempt = db.execute(
        "SELECT * FROM login_attempts WHERE email=?", (email,)
    ).fetchone()
    if attempt and attempt["reset_at"] > now() and attempt["attempts"] >= 10:
        raise HTTPException(429, "尝试次数过多，请 15 分钟后再试")
    user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
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


@router.patch("/me")
def update_profile(data: Profile, user=Depends(student), db=Depends(get_db)):
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
