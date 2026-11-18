from fastapi import APIRouter, Body, Depends, HTTPException, Query
from ..db import get_db, get_db_readonly, now
from ..auth import current_user, student, public_user
from ..schemas import Message
from ..services import post_view
from ..governance import blocked, conversation_blocked, public_post

router = APIRouter(prefix="/api", tags=["同学与消息"])


def verified_viewer(user=Depends(current_user)):
    if not user["verified"]:
        raise HTTPException(403, "请先完成校园认证")
    return user


@router.get("/people")
def people(
    q: str = "", tag: str = "", user=Depends(verified_viewer), db=Depends(get_db_readonly)
):
    return [
        public_user(r)
        for r in db.execute(
            "SELECT * FROM users WHERE deleted_at IS NULL AND verified=1 AND banned=0 AND is_admin=0 AND searchable=1 AND instr(name,?)>0 AND instr(tags,?)>0 ORDER BY id LIMIT 100",
            (q, tag),
        )
    ]


@router.get("/people/{person_id}")
def person(person_id: int, user=Depends(verified_viewer), db=Depends(get_db_readonly)):
    person = db.execute(
        "SELECT * FROM users WHERE id=? AND verified=1 AND banned=0 AND deleted_at IS NULL", (person_id,)
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
            ) if public_post(db, p, user)
        ]
        if person["public_posts"]
        else None,
        "teams": [
            dict(r)
            for r in db.execute(
                "SELECT p.id AS post_id,p.title,r.name AS role_name FROM applications a JOIN posts p ON p.id=a.post_id JOIN roles r ON r.id=a.role_id JOIN users u ON u.id=p.owner_id WHERE a.user_id=? AND a.status='accepted' AND p.taken_down=0 AND u.deleted_at IS NULL AND (u.banned=0 OR p.status='ended') AND u.public_posts=1",
                (person_id,),
            )
        ]
        if person["public_teams"]
        else None,
    }


@router.get('/notices')
def notices(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
            user=Depends(current_user), db=Depends(get_db_readonly)):
    return [dict(r) for r in db.execute('SELECT * FROM notices WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?',
                                      (user['id'], limit, offset))]


@router.post('/notices/read')
def read_notices(user=Depends(current_user), db=Depends(get_db)):
    db.execute('UPDATE notices SET is_read=1 WHERE user_id=?', (user['id'],))
    return {'ok': True}


@router.post('/notices/{notice_id}/read')
def read_notice(notice_id: int, user=Depends(current_user), db=Depends(get_db)):
    if not db.execute('UPDATE notices SET is_read=1 WHERE id=? AND user_id=?', (notice_id, user['id'])).rowcount:
        raise HTTPException(404, '通知不存在')
    return {'ok': True}


@router.get('/unread')
def unread(user=Depends(current_user), db=Depends(get_db_readonly)):
    count = db.execute('''SELECT count(*) FROM messages m WHERE m.recipient_id=? AND m.is_read=0
        AND NOT EXISTS(SELECT 1 FROM message_deletions d WHERE d.user_id=? AND d.message_id=m.id)
        AND m.id>coalesce((SELECT h.through_id FROM hidden_conversations h WHERE h.user_id=? AND h.peer_id=m.sender_id),0)''',
                       (user['id'], user['id'], user['id'])).fetchone()[0]
    notices = db.execute('SELECT count(*) FROM notices WHERE user_id=? AND is_read=0', (user['id'],)).fetchone()[0]
    chats = db.execute('''SELECT count(*) FROM chat_messages x
        JOIN chat_members m ON m.chat_id=x.chat_id AND m.user_id=? AND m.deleted_at IS NULL
        JOIN group_chats c ON c.id=m.chat_id AND c.retention_until IS NULL
        WHERE x.id>m.last_read_id AND x.sender_id<>m.user_id
          AND x.id NOT IN (
              SELECT d.message_id FROM chat_message_deletions d
              WHERE d.chat_id=m.chat_id AND d.user_id=m.user_id
          )''',
                       (user['id'],)).fetchone()[0]
    return {'messages': count, 'notices': notices, 'chats': chats, 'total': count + notices + chats}


@router.get('/conversations')
def conversations(user=Depends(current_user), db=Depends(get_db_readonly)):
    rows = db.execute('''WITH visible AS (
        SELECT m.*, CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END AS peer
        FROM messages m WHERE (sender_id=? OR recipient_id=?)
        AND NOT EXISTS(SELECT 1 FROM message_deletions d WHERE d.user_id=? AND d.message_id=m.id)
    ), latest AS (
        SELECT v.peer,max(v.id) AS last_id,
            sum(CASE WHEN v.recipient_id=? AND v.is_read=0
                AND v.id>coalesce(h.through_id,0) THEN 1 ELSE 0 END) AS unread_count
        FROM visible v LEFT JOIN hidden_conversations h ON h.user_id=? AND h.peer_id=v.peer
        GROUP BY v.peer
    )
    SELECT v.*,l.unread_count FROM latest l JOIN visible v ON v.id=l.last_id
    WHERE l.last_id>coalesce((SELECT through_id FROM hidden_conversations h WHERE h.user_id=? AND h.peer_id=l.peer),0)
    ORDER BY v.id DESC''', (user['id'], user['id'], user['id'], user['id'], user['id'], user['id'], user['id'])).fetchall()
    result = []
    for row in rows:
        peer = db.execute('SELECT * FROM users WHERE id=?', (row['peer'],)).fetchone()
        result.append({'peer': {'id': peer['id'], 'name': peer['name']},
                       'last': {'body': row['body'], 'created_at': row['created_at']},
                       'unread_count': row['unread_count']})
    return result


@router.get('/conversations/{peer_id}')
def conversation_info(peer_id: int, user=Depends(current_user), db=Depends(get_db_readonly)):
    peer = db.execute('SELECT * FROM users WHERE id=?', (peer_id,)).fetchone()
    if not peer:
        raise HTTPException(404, '同学不存在')
    return {'id': peer_id, 'name': peer['name'], 'blocked_by_me': blocked(db, peer_id, user['id']),
            'can_block': bool(user['verified'] and not user['banned'] and not user['is_admin']
                              and not peer['is_admin'] and not peer['deleted_at'] and peer_id != user['id']),
            'can_message': bool(user['verified'] and not user['banned'] and peer['verified'] and not peer['banned']
                                and not peer['deleted_at'] and not conversation_blocked(db, user['id'], peer_id) and peer_id != user['id'])}


@router.post('/conversations/{peer_id}/hide')
def hide_conversation(peer_id: int, user=Depends(student), db=Depends(get_db)):
    last_id = db.execute('SELECT max(id) FROM messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)',
                         (user['id'], peer_id, peer_id, user['id'])).fetchone()[0]
    if last_id is None:
        raise HTTPException(404, '会话不存在')
    db.execute('INSERT INTO hidden_conversations(user_id,peer_id,through_id) VALUES(?,?,?) ON CONFLICT(user_id,peer_id) DO UPDATE SET through_id=excluded.through_id',
               (user['id'], peer_id, last_id))
    db.execute('UPDATE messages SET is_read=1 WHERE recipient_id=? AND sender_id=? AND id<=?', (user['id'], peer_id, last_id))
    return {'ok': True}


@router.get('/messages/{peer_id}')
def messages(peer_id: int, after: int = Query(0, ge=0), user=Depends(current_user), db=Depends(get_db_readonly)):
    return [dict(r) for r in db.execute('''SELECT m.id,sender_id,recipient_id,body,m.created_at FROM messages m
        WHERE m.id>? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))
        AND NOT EXISTS(SELECT 1 FROM message_deletions d WHERE d.user_id=? AND d.message_id=m.id)
        ORDER BY m.id LIMIT 200''', (after, user['id'], peer_id, peer_id, user['id'], user['id']))]


@router.delete('/messages/{message_id}')
def delete_message(message_id: int, user=Depends(student), db=Depends(get_db)):
    if not db.execute('SELECT 1 FROM messages WHERE id=? AND (sender_id=? OR recipient_id=?)', (message_id, user['id'], user['id'])).fetchone():
        raise HTTPException(404, '消息不存在')
    db.execute('INSERT OR IGNORE INTO message_deletions VALUES(?,?,?)', (user['id'], message_id, now()))
    return {'ok': True}


@router.post('/messages/{peer_id}/read')
def read_messages(peer_id: int, through_id: int | None = Body(default=None, embed=True, ge=0),
                  user=Depends(current_user), db=Depends(get_db)):
    db.execute('UPDATE messages SET is_read=1 WHERE sender_id=? AND recipient_id=? AND (? IS NULL OR id<=?)',
               (peer_id, user['id'], through_id, through_id))
    return {'ok': True}


@router.post('/messages/{peer_id}', status_code=201)
def send_message(peer_id: int, data: Message, user=Depends(student), db=Depends(get_db)):
    if data.client_id:
        existing = db.execute('SELECT id,recipient_id,body FROM messages WHERE sender_id=? AND client_id=?',
                              (user['id'], data.client_id)).fetchone()
        if existing:
            if existing['recipient_id'] != peer_id or existing['body'] != data.body:
                raise HTTPException(409, '请求标识已用于其他消息')
            return {'id': existing['id']}
    if peer_id == user['id']:
        raise HTTPException(422, '不能给自己发送私信')
    if not db.execute('SELECT 1 FROM users WHERE id=? AND verified=1 AND banned=0 AND deleted_at IS NULL', (peer_id,)).fetchone():
        raise HTTPException(404, '收件人当前不可接收私信')
    if conversation_blocked(db, user['id'], peer_id):
        raise HTTPException(403, '当前无法向该用户发送私信')
    message_id = db.execute('INSERT INTO messages(sender_id,recipient_id,body,created_at,client_id) VALUES(?,?,?,?,?)',
                            (user['id'], peer_id, data.body, now(), data.client_id)).lastrowid
    return {'id': message_id}
