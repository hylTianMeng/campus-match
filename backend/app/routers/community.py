from fastapi import APIRouter, Depends, HTTPException, Query
from ..db import get_db, now
from ..auth import current_user, student, public_user
from ..schemas import Message
from ..services import post_view

router = APIRouter(prefix="/api", tags=["同学与消息"])


def verified_viewer(user=Depends(current_user)):
    if not user["verified"]:
        raise HTTPException(403, "请先完成校园认证")
    return user


@router.get("/people")
def people(
    q: str = "", tag: str = "", user=Depends(verified_viewer), db=Depends(get_db)
):
    return [
        public_user(r)
        for r in db.execute(
            "SELECT * FROM users WHERE verified=1 AND banned=0 AND searchable=1 AND instr(name,?)>0 AND instr(tags,?)>0 ORDER BY id LIMIT 100",
            (q, tag),
        )
    ]


@router.get("/people/{person_id}")
def person(person_id: int, user=Depends(verified_viewer), db=Depends(get_db)):
    person = db.execute(
        "SELECT * FROM users WHERE id=? AND verified=1 AND banned=0", (person_id,)
    ).fetchone()
    if not person:
        raise HTTPException(404, "同学不存在")
    # Public profile intentionally never includes application records or private material.
    return {
        **public_user(person),
        "public_posts": bool(person["public_posts"]),
        "public_teams": bool(person["public_teams"]),
        "posts": [
            post_view(db, p, user)
            for p in db.execute(
                "SELECT * FROM posts WHERE owner_id=? ORDER BY id DESC", (person_id,)
            )
        ]
        if person["public_posts"]
        else None,
        "teams": [
            dict(r)
            for r in db.execute(
                "SELECT p.id AS post_id,p.title,r.name AS role_name FROM applications a JOIN posts p ON p.id=a.post_id JOIN roles r ON r.id=a.role_id WHERE a.user_id=? AND a.status='accepted'",
                (person_id,),
            )
        ]
        if person["public_teams"]
        else None,
    }


@router.get("/notices")
def notices(user=Depends(current_user), db=Depends(get_db)):
    return [
        dict(r)
        for r in db.execute(
            "SELECT * FROM notices WHERE user_id=? ORDER BY id DESC LIMIT 200",
            (user["id"],),
        )
    ]


@router.post("/notices/read")
def read_notices(user=Depends(current_user), db=Depends(get_db)):
    db.execute("UPDATE notices SET is_read=1 WHERE user_id=?", (user["id"],))
    return {"ok": True}


@router.get("/unread")
def unread(user=Depends(current_user), db=Depends(get_db)):
    messages = db.execute(
        "SELECT count(*) FROM messages WHERE recipient_id=? AND is_read=0",
        (user["id"],),
    ).fetchone()[0]
    notices = db.execute(
        "SELECT count(*) FROM notices WHERE user_id=? AND is_read=0", (user["id"],)
    ).fetchone()[0]
    return {"messages": messages, "notices": notices, "total": messages + notices}


@router.get("/conversations")
def conversations(user=Depends(current_user), db=Depends(get_db)):
    ids = db.execute(
        "SELECT DISTINCT CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END AS peer FROM messages WHERE sender_id=? OR recipient_id=?",
        (user["id"], user["id"], user["id"]),
    ).fetchall()
    result = []
    for row in ids:
        peer = public_user(
            db.execute("SELECT * FROM users WHERE id=?", (row["peer"],)).fetchone()
        )
        last = db.execute(
            "SELECT body,created_at FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 1",
            (user["id"], row["peer"], row["peer"], user["id"]),
        ).fetchone()
        result.append({"peer": peer, "last": dict(last)})
    return sorted(result, key=lambda r: r["last"]["created_at"], reverse=True)


@router.get("/messages/{peer_id}")
def messages(
    peer_id: int,
    after: int = Query(0, ge=0),
    user=Depends(current_user),
    db=Depends(get_db),
):
    return [
        dict(r)
        for r in db.execute(
            "SELECT id,sender_id,recipient_id,body,created_at FROM messages WHERE id>? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY id LIMIT 200",
            (after, user["id"], peer_id, peer_id, user["id"]),
        )
    ]


@router.post("/messages/{peer_id}/read")
def read_messages(peer_id: int, user=Depends(current_user), db=Depends(get_db)):
    db.execute(
        "UPDATE messages SET is_read=1 WHERE sender_id=? AND recipient_id=?",
        (peer_id, user["id"]),
    )
    return {"ok": True}


@router.post("/messages/{peer_id}", status_code=201)
def send_message(
    peer_id: int, data: Message, user=Depends(student), db=Depends(get_db)
):
    if peer_id == user["id"]:
        raise HTTPException(422, "不能给自己发送私信")
    if not db.execute(
        "SELECT 1 FROM users WHERE id=? AND verified=1 AND banned=0", (peer_id,)
    ).fetchone():
        raise HTTPException(404, "收件人当前不可接收私信")
    message_id = db.execute(
        "INSERT INTO messages(sender_id,recipient_id,body,created_at) VALUES(?,?,?,?)",
        (user["id"], peer_id, data.body, now()),
    ).lastrowid
    return {"id": message_id}
