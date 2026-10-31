"""SQLite unit of work. Writes are serialized before business invariants are read."""

import os
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "campuscrew.sqlite3"


def now():
    return datetime.now(timezone.utc).isoformat()


def connect():
    path = os.getenv("DATABASE_PATH", str(DEFAULT_DB))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(
        path, timeout=15, isolation_level=None, check_same_thread=False
    )
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=15000")
    return db


def init_db():
    db = connect()
    try:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript((Path(__file__).parent / "schema.sql").read_text())
    finally:
        db.close()


def get_db():
    db = connect()
    try:
        db.execute("BEGIN IMMEDIATE")
        expire_posts(db)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def notify(db, user_id, text, post_id=None):
    db.execute(
        "INSERT INTO notices(user_id,body,post_id,created_at) VALUES(?,?,?,?)",
        (user_id, text, post_id, now()),
    )


def expire_posts(db):
    for post in db.execute(
        "SELECT id FROM posts WHERE status='open' AND deadline<=?", (now(),)
    ).fetchall():
        for app in db.execute(
            "SELECT id,user_id FROM applications WHERE post_id=? AND status='pending'",
            (post["id"],),
        ).fetchall():
            notify(db, app["user_id"], "招募已截止，待审核申请已过期。", post["id"])
            db.execute(
                "INSERT INTO application_events(application_id,actor_id,status,reason,created_at) VALUES(?,NULL,?,?,?)",
                (app["id"], "expired", "招募已截止", now()),
            )
        db.execute(
            "UPDATE applications SET status='expired',reason='招募已截止',updated_at=? WHERE post_id=? AND status='pending'",
            (now(), post["id"]),
        )
        db.execute(
            "UPDATE posts SET status='ended',end_reason='expired' WHERE id=?",
            (post["id"],),
        )
