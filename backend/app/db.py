"""SQLite unit of work. Writes are serialized before business invariants are read."""

import os
import sqlite3
import threading
from pathlib import Path
from datetime import datetime, timezone

DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "campuscrew.sqlite3"

# Serialize every write transaction (schema init, expiry sweeps and request
# writes). SQLite in WAL mode on Windows intermittently raises
# "attempt to write a readonly database" when two connections write at once, so
# all writers are funneled through this single process-local lock. Reads stay
# lock-free and rely on WAL's reader/writer isolation.
WRITE_LOCK = threading.Lock()


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


def migrate(db):
    """Idempotent additive migration for databases created before the account module.

    Only ``ALTER TABLE ADD COLUMN`` needs guarding because repeating it raises an
    error; new tables and indexes use ``CREATE ... IF NOT EXISTS`` in schema.sql
    and are therefore created on every startup for both fresh and legacy databases.
    """
    existing = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
    if "is_admin" not in existing:
        db.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
    if "avatar_path" not in existing:
        db.execute("ALTER TABLE users ADD COLUMN avatar_path TEXT NOT NULL DEFAULT ''")
    if "deleted_at" not in existing:
        db.execute("ALTER TABLE users ADD COLUMN deleted_at TEXT")
    # Keep exactly one schema_version row (version=2). ``schema.sql`` already
    # inserts version 2 with OR IGNORE, so on a legacy DB both 1 and 2 may exist
    # here; remove the stale 1 row instead of UPDATE-ing it into a PK conflict.
    db.execute("DELETE FROM schema_version WHERE version<2")
    db.execute("INSERT OR IGNORE INTO schema_version VALUES(2)")
    db.commit()


def init_db():
    with WRITE_LOCK:
        db = connect()
        try:
            db.execute("PRAGMA journal_mode=WAL")
            # Commit the journal-mode change before running the schema script: the
            # WAL transition holds a write lock, and leaving it pending makes a
            # concurrent startup fail with "attempt to write a readonly database".
            db.commit()
            db.executescript((Path(__file__).parent / "schema.sql").read_text())
            # C 模块（招募）迁移：附件索引、角色 accepting 标记、帖子 updated_at。
            db.execute("DROP INDEX IF EXISTS one_attachment_per_post")
            if "accepting" not in {row["name"] for row in db.execute("PRAGMA table_info(roles)")}:
                db.execute("ALTER TABLE roles ADD COLUMN accepting INTEGER NOT NULL DEFAULT 1")
            if "updated_at" not in {
                row["name"] for row in db.execute("PRAGMA table_info(posts)")
            }:
                db.execute("ALTER TABLE posts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
                db.execute("UPDATE posts SET updated_at=created_at WHERE updated_at=''")
            # A 模块（账号）迁移：is_admin / avatar_path / deleted_at + schema_version=2。
            migrate(db)
        finally:
            db.close()


def get_db():
    db = connect()
    try:
        with WRITE_LOCK:
            db.execute("BEGIN IMMEDIATE")
            expire_posts(db)
            yield db
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db_reader():
    """Read-only autocommit connection used only for authentication lookups.

    Resolving the current user is a single ``SELECT``; it must never open a
    write transaction, otherwise every authenticated request would contend with
    concurrent writers in WAL mode (the original cause of intermittent
    "服务暂不可用" on the lobby).
    """
    db = connect()
    try:
        yield db
    finally:
        db.close()


def get_db_readonly():
    """Read transaction for read-only endpoints, with lazy expiry on the side.

    The common path is a plain ``BEGIN`` (DEFERRED) so GET requests never take
    SQLite's write lock and therefore never contend with writers (avatar uploads,
    expiry sweeps, ``--reload``). Expiry is only performed when an open post has
    actually passed its deadline, and then it is serialized under ``WRITE_LOCK``
    just like every other write; ``deadline_worker`` in ``main.py`` remains the
    periodic fallback sweeper.
    """
    db = connect()
    try:
        if db.execute(
            "SELECT 1 FROM posts WHERE status='open' AND deadline<=?", (now(),)
        ).fetchone():
            with WRITE_LOCK:
                db.execute("BEGIN IMMEDIATE")
                expire_posts(db)
                db.commit()
        db.execute("BEGIN")
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
        "SELECT id,owner_id,title FROM posts WHERE status='open' AND deadline<=?", (now(),)
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
        notify(
            db,
            post["owner_id"],
            f"招募「{post['title']}」已到截止时间，自动结束；可延长截止时间重新开放。",
            post["id"],
        )
