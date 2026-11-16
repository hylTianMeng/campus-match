"""Administrator endpoints for user management (list / ban / unban)."""

from fastapi import APIRouter, Depends, Query

from ..auth import admin
from ..db import get_db
from ..schemas import BanUser, UnbanUser
from ..governance import set_user_ban

router = APIRouter(prefix="/api/admin", tags=["管理"])


def _avatar_url(user):
    return f"/api/users/{user['id']}/avatar" if user["avatar_path"] else None


@router.get("/users")
def list_users(
    q: str = "",
    banned: str = "",
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(admin),
    db=Depends(get_db),
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
    set_user_ban(db, user, user_id, True, data.reason)
    return {"ok": True}


@router.post("/users/{user_id}/unban")
def unban_user(user_id: int, data: UnbanUser, user=Depends(admin), db=Depends(get_db)):
    set_user_ban(db, user, user_id, False, data.reason)
    return {"ok": True}
