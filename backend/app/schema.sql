CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES(2);
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 name TEXT NOT NULL, dept TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
 bio TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', resources TEXT NOT NULL DEFAULT '[]',
 verified INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0,
 searchable INTEGER NOT NULL DEFAULT 1, public_posts INTEGER NOT NULL DEFAULT 1,
 public_teams INTEGER NOT NULL DEFAULT 0,
 avatar_path TEXT NOT NULL DEFAULT '',
 is_admin INTEGER NOT NULL DEFAULT 0,
 deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions(
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts(email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS posts(
 id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, category TEXT NOT NULL REFERENCES categories(name), description TEXT NOT NULL,
 tags TEXT NOT NULL DEFAULT '[]', place TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL,
 event_time TEXT NOT NULL DEFAULT '', extras TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','ended')),
 end_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles(
 id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 name TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity>0),
 description TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', accepting INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS applications(
 id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id),
 role_id INTEGER NOT NULL REFERENCES roles(id), user_id INTEGER NOT NULL REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','withdrawn','expired')),
 message TEXT NOT NULL DEFAULT '', experience TEXT NOT NULL DEFAULT '', portfolio TEXT NOT NULL DEFAULT '',
 resources TEXT NOT NULL DEFAULT '[]',
 reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_role ON applications(role_id,user_id) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS one_accepted_post ON applications(post_id,user_id) WHERE status='accepted';
CREATE INDEX IF NOT EXISTS post_applications ON applications(post_id,status);
CREATE TABLE IF NOT EXISTS application_bans(
 id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 UNIQUE(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS application_bans_user ON application_bans(user_id);
CREATE TABLE IF NOT EXISTS application_events(
 id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id),
 actor_id INTEGER REFERENCES users(id), status TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts(
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), payload TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments(
 id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
 post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, content_type TEXT NOT NULL, content BLOB NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attachments_post ON attachments(post_id);
CREATE TABLE IF NOT EXISTS profile_attachments(
 id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, content_type TEXT NOT NULL, content BLOB NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS profile_attachments_owner ON profile_attachments(owner_id);
CREATE TABLE IF NOT EXISTS application_attachments(
 id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL REFERENCES users(id),
 application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, content_type TEXT NOT NULL, content BLOB NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS application_attachments_owner ON application_attachments(owner_id);
CREATE INDEX IF NOT EXISTS application_attachments_application ON application_attachments(application_id);
CREATE TABLE IF NOT EXISTS favorites(
 user_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,post_id)
);
CREATE TABLE IF NOT EXISTS notices(
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages(
 id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL REFERENCES users(id), recipient_id INTEGER NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
 CHECK(sender_id<>recipient_id)
);
CREATE INDEX IF NOT EXISTS inbox ON messages(recipient_id,sender_id,id);

CREATE TABLE IF NOT EXISTS email_codes(
 id INTEGER PRIMARY KEY,
 email TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
 code_hash TEXT NOT NULL,
 user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 consumed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS email_code_lookup ON email_codes(email, purpose, consumed);

CREATE TABLE IF NOT EXISTS admin_actions(
 id INTEGER PRIMARY KEY,
 admin_id INTEGER NOT NULL REFERENCES users(id),
 target_user_id INTEGER NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('ban','unban')),
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_post_actions(
 id INTEGER PRIMARY KEY,
 admin_id INTEGER NOT NULL REFERENCES users(id),
 post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN ('takedown','restore')),
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
