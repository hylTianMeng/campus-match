"""SQLite unit of work. Writes are serialized before business invariants are read."""

import os
import sqlite3
import threading
from pathlib import Path
from datetime import datetime, timedelta, timezone

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
    if "resources" not in existing:
        db.execute("ALTER TABLE users ADD COLUMN resources TEXT NOT NULL DEFAULT '[]'")
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
            db.executescript((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
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
            additions = {
                "posts": {"taken_down": "INTEGER NOT NULL DEFAULT 0"},
                "applications": {"resources": "TEXT NOT NULL DEFAULT '[]'"},
                "messages": {"client_id": "TEXT"},
                "notices": {"event_key": "TEXT", "kind": "TEXT NOT NULL DEFAULT 'business'",
                            "target_path": "TEXT NOT NULL DEFAULT ''"},
                "group_chats": {"full_at": "TEXT"},
                "chat_members": {"role_name": "TEXT NOT NULL DEFAULT ''"},
            }
            for table, columns in additions.items():
                existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
                for name, definition in columns.items():
                    if name not in existing:
                        db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS message_request_key ON messages(sender_id,client_id) WHERE client_id IS NOT NULL")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS notice_event_key ON notices(user_id,event_key) WHERE event_key IS NOT NULL")
            # 群聊举报：旧库的 reports 表 CHECK 约束不含 chat_message，需整表重建。
            reports_sql = db.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='reports'"
            ).fetchone()
            if reports_sql and "chat_message" not in reports_sql["sql"]:
                db.executescript(
                    """
                    CREATE TABLE reports_rebuilt(
                        id INTEGER PRIMARY KEY, reporter_id INTEGER NOT NULL REFERENCES users(id),
                        target_type TEXT NOT NULL CHECK(target_type IN ('post','user','message','chat_message')),
                        target_id INTEGER NOT NULL,
                        subject_user_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER,
                        reason TEXT NOT NULL, target_summary TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
                        resolution TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '',
                        admin_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL, resolved_at TEXT
                    );
                    INSERT INTO reports_rebuilt SELECT * FROM reports;
                    DROP TABLE reports;
                    ALTER TABLE reports_rebuilt RENAME TO reports;
                    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_report
                        ON reports(reporter_id,target_type,target_id) WHERE status='pending';
                    """
                )
            db.executescript((Path(__file__).parent / "governance.sql").read_text(encoding="utf-8"))
            # Normalize the earlier develop representation without discarding applications.
            post_columns = {row["name"] for row in db.execute("PRAGMA table_info(posts)")}
            if {"status", "end_reason"} <= post_columns:
                db.execute("UPDATE posts SET taken_down=1,status='open',end_reason=NULL WHERE end_reason='taken_down'")
        finally:
            db.close()


def get_db():
    db = connect()
    try:
        with WRITE_LOCK:
            db.execute("BEGIN IMMEDIATE")
            expire_posts(db)
            sweep_group_chats(db)
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
        ).fetchone() or db.execute(
            "SELECT 1 FROM group_chats WHERE retention_until IS NOT NULL AND retention_until<=?", (now(),)
        ).fetchone() or db.execute(
            """SELECT 1 FROM group_chats c JOIN posts p ON p.id=c.post_id
               WHERE c.read_only=0 AND c.dissolved_at IS NULL AND c.retention_until IS NULL
               AND p.status='ended' AND p.updated_at<>'' AND p.updated_at<=?""",
            ((datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),),
        ).fetchone():
            with WRITE_LOCK:
                db.execute("BEGIN IMMEDIATE")
                expire_posts(db)
                sweep_group_chats(db)
                db.commit()
        db.execute("BEGIN")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def notify(db, user_id, text, post_id=None, *, event_key=None, kind="business", target_path=None):
    """Persist the inbox event in the caller's business transaction."""
    if target_path is None:
        target_path = f"/detail/{post_id}" if post_id else "/settings"
    db.execute(
        "INSERT OR IGNORE INTO notices(user_id,body,post_id,created_at,event_key,kind,target_path) VALUES(?,?,?,?,?,?,?)",
        (user_id, text, post_id, now(), event_key, kind, target_path),
    )


def expire_posts(db):
    for post in db.execute(
        "SELECT id,owner_id,title FROM posts WHERE status='open' AND deadline<=?", (now(),)
    ).fetchall():
        for app in db.execute(
            "SELECT id,user_id FROM applications WHERE post_id=? AND status='pending'",
            (post["id"],),
        ).fetchall():
            notify(db, app["user_id"], "招募已截止，待审核申请已过期。", post["id"], event_key=f"application-expired:{app['id']}", kind="application", target_path="/applications")
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


CHAT_COUNTDOWN_DAYS = 7
CHAT_RETENTION_DAYS = 7


def sweep_group_chats(db):
    """群聊生命周期：招募结束满 7 天遣散转只读；全员删除满 7 天物理清库。

    - 发布者手动解散（dissolved_at 非空）的群聊只转只读、不重置；
    - 招募到期重开（status 回到 open）时，未解散的群聊恢复可发言；
    - 保留期（retention_until）内普通成员不可见，仅管理员可查，到期后级联清库。
    """
    timestamp = now()
    # 0) 满员时间：招募结束（ended）时未记录 full_at 的群聊补记（以招募结束时间为准）。
    db.execute(
        """UPDATE group_chats SET full_at=(
               SELECT p.updated_at FROM posts p WHERE p.id=group_chats.post_id
           )
           WHERE full_at IS NULL
             AND post_id IN (SELECT id FROM posts WHERE status='ended' AND updated_at<>'')""",
    )
    # 1) 遣散：招募结束（ended）满 7 天且未被发布者解散的群聊转为只读。
    scattered_cutoff = (
        datetime.now(timezone.utc) - timedelta(days=CHAT_COUNTDOWN_DAYS)
    ).isoformat()
    for chat in db.execute(
        """SELECT c.id,p.title FROM group_chats c JOIN posts p ON p.id=c.post_id
           WHERE c.read_only=0 AND c.dissolved_at IS NULL AND c.retention_until IS NULL
           AND p.status='ended' AND p.updated_at<>'' AND p.updated_at<=?""",
        (scattered_cutoff,),
    ).fetchall():
        db.execute("UPDATE group_chats SET read_only=1 WHERE id=?", (chat["id"],))
        for member in db.execute(
            "SELECT user_id FROM chat_members WHERE chat_id=? AND deleted_at IS NULL",
            (chat["id"],),
        ).fetchall():
            notify(
                db,
                member["user_id"],
                f"「{chat['title']}」的群聊已遣散，转为只读；你可删除该群聊。",
                event_key=f"chat-scattered:{chat['id']}",
                kind="chat",
                target_path="/chats",
            )
    # 2) 招募到期重开时，未解散的群聊恢复活跃（解除只读）。
    for chat in db.execute(
        """SELECT c.id FROM group_chats c JOIN posts p ON p.id=c.post_id
           WHERE c.read_only=1 AND c.dissolved_at IS NULL AND c.retention_until IS NULL
           AND p.status='open' AND p.taken_down=0""",
    ).fetchall():
        db.execute("UPDATE group_chats SET read_only=0 WHERE id=?", (chat["id"],))
    # 3) 保留期到期：全员删除满 7 天，物理清库（级联删除成员与消息）。
    for chat in db.execute(
        "SELECT id FROM group_chats WHERE retention_until IS NOT NULL AND retention_until<=?",
        (timestamp,),
    ).fetchall():
        db.execute("DELETE FROM group_chats WHERE id=?", (chat["id"],))
