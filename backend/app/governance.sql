CREATE TABLE IF NOT EXISTS blocks(
 blocker_id INTEGER NOT NULL REFERENCES users(id), blocked_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE TABLE IF NOT EXISTS message_deletions(
 user_id INTEGER NOT NULL REFERENCES users(id), message_id INTEGER NOT NULL REFERENCES messages(id),
 created_at TEXT NOT NULL, PRIMARY KEY(user_id,message_id)
);
CREATE TABLE IF NOT EXISTS hidden_conversations(
 user_id INTEGER NOT NULL REFERENCES users(id), peer_id INTEGER NOT NULL REFERENCES users(id),
 through_id INTEGER NOT NULL, PRIMARY KEY(user_id,peer_id)
);
CREATE TABLE IF NOT EXISTS reports(
 id INTEGER PRIMARY KEY, reporter_id INTEGER NOT NULL REFERENCES users(id),
 target_type TEXT NOT NULL CHECK(target_type IN ('post','user','message')), target_id INTEGER NOT NULL,
 subject_user_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER,
 reason TEXT NOT NULL, target_summary TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
 resolution TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '',
 admin_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_report ON reports(reporter_id,target_type,target_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS post_actions(
 id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('take-down','restore')), reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS message_access_audits(
 id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES users(id),
 first_user_id INTEGER NOT NULL REFERENCES users(id), second_user_id INTEGER NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS preserve_message_access_update BEFORE UPDATE ON message_access_audits
BEGIN SELECT RAISE(ABORT,'access audit is append only'); END;
CREATE TRIGGER IF NOT EXISTS preserve_message_access_delete BEFORE DELETE ON message_access_audits
BEGIN SELECT RAISE(ABORT,'access audit is append only'); END;
CREATE TRIGGER IF NOT EXISTS preserve_message_body BEFORE UPDATE OF body,sender_id,recipient_id,created_at ON messages
BEGIN SELECT RAISE(ABORT,'message content is immutable'); END;
