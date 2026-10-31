"""初始 MVP 迁移：9 张表 + 生成列部分唯一索引。

与 mvp_spec.md §3 DDL 精确对齐，特别是 applications 表的 STORED 生成列：
- pending_guard + UNIQUE(position_id, pending_guard) 兜底 BR-05 同岗最多一 pending
- accepted_guard + UNIQUE(recruitment_id, accepted_guard) 兜底 BR-05 同招募最多一 accepted

Revision ID: 0001
Revises:
Create Date: 2026-10-30
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE users (
          id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          email         VARCHAR(255) NOT NULL COMMENT '校园邮箱 trim+lowercase 后唯一',
          password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt',
          nickname      VARCHAR(50)  NOT NULL,
          avatar_url    VARCHAR(512) NULL,
          department    VARCHAR(100) NULL,
          grade         VARCHAR(32)  NULL,
          bio           VARCHAR(500) NULL,
          is_verified   TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'MVP 注册即认证，守卫仍校验',
          status        ENUM('active','banned','deleted') NOT NULL DEFAULT 'active',
          token_version INT NOT NULL DEFAULT 0 COMMENT '登出/改密 +1 撤销旧 token',
          created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          deleted_at    DATETIME(3) NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_users_email (email),
          KEY idx_users_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE tags (
          id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          name       VARCHAR(50) NOT NULL,
          kind       ENUM('skill','interest','recruitment') NOT NULL DEFAULT 'skill',
          is_active  TINYINT(1) NOT NULL DEFAULT 1,
          created_by BIGINT UNSIGNED NULL COMMENT '用户自建标签',
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY uq_tags_name_kind (name, kind),
          CONSTRAINT fk_tags_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE recruitments (
          id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          owner_id     BIGINT UNSIGNED NOT NULL,
          title        VARCHAR(100) NOT NULL,
          description  TEXT NOT NULL,
          location     VARCHAR(100) NULL,
          activity_time VARCHAR(100) NULL,
          deadline_at  DATETIME(3) NOT NULL COMMENT '发布时必须为未来时间',
          status       ENUM('draft','open','ended') NOT NULL DEFAULT 'draft',
          end_reason   ENUM('filled','expired','manual') NULL COMMENT '仅 ended 时填写',
          ended_at     DATETIME(3) NULL,
          published_at DATETIME(3) NULL,
          created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          KEY idx_rec_owner_status (owner_id, status),
          KEY idx_rec_status_deadline (status, deadline_at),
          KEY idx_rec_published (status, published_at, id),
          CONSTRAINT fk_rec_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE positions (
          id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          recruitment_id BIGINT UNSIGNED NOT NULL,
          name           VARCHAR(50) NOT NULL,
          capacity       INT NOT NULL,
          description    VARCHAR(500) NULL,
          sort_order     INT NOT NULL DEFAULT 0,
          created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          KEY idx_pos_recruitment (recruitment_id),
          CONSTRAINT chk_pos_capacity CHECK (capacity > 0),
          CONSTRAINT fk_pos_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE recruitment_tags (
          recruitment_id BIGINT UNSIGNED NOT NULL,
          tag_id         BIGINT UNSIGNED NOT NULL,
          PRIMARY KEY (recruitment_id, tag_id),
          KEY idx_rt_tag (tag_id),
          CONSTRAINT fk_rt_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE CASCADE,
          CONSTRAINT fk_rt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE position_tags (
          position_id BIGINT UNSIGNED NOT NULL,
          tag_id      BIGINT UNSIGNED NOT NULL,
          PRIMARY KEY (position_id, tag_id),
          KEY idx_pt_tag (tag_id),
          CONSTRAINT fk_pt_position FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE,
          CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    # ★ 生成列部分唯一索引兜底 BR-05/BR-06
    op.execute(
        """
        CREATE TABLE applications (
          id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          recruitment_id BIGINT UNSIGNED NOT NULL,
          position_id    BIGINT UNSIGNED NOT NULL,
          applicant_id   BIGINT UNSIGNED NOT NULL,
          message        VARCHAR(500) NULL,
          status         ENUM('pending','accepted','not_passed','withdrawn','expired') NOT NULL DEFAULT 'pending',
          reason         ENUM('submitted','approved','rejected','applicant_withdrawn',
                              'accepted_other_position','capacity_full','deadline_reached',
                              'manual_end','offer_revoked','offer_abandoned') NOT NULL DEFAULT 'submitted',
          pending_guard  BIGINT UNSIGNED GENERATED ALWAYS AS
                         (CASE WHEN status='pending'  THEN applicant_id ELSE NULL END) STORED,
          accepted_guard BIGINT UNSIGNED GENERATED ALWAYS AS
                         (CASE WHEN status='accepted' THEN applicant_id ELSE NULL END) STORED,
          created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          decided_at     DATETIME(3) NULL,
          PRIMARY KEY (id),
          KEY idx_app_recruitment (recruitment_id),
          KEY idx_app_position_status (position_id, status),
          KEY idx_app_applicant (applicant_id),
          UNIQUE KEY uq_app_pending  (position_id, pending_guard),
          UNIQUE KEY uq_app_accepted (recruitment_id, accepted_guard),
          CONSTRAINT fk_app_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE RESTRICT,
          CONSTRAINT fk_app_position    FOREIGN KEY (position_id)    REFERENCES positions(id)    ON DELETE RESTRICT,
          CONSTRAINT fk_app_applicant   FOREIGN KEY (applicant_id)   REFERENCES users(id)        ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE application_history (
          id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          application_id BIGINT UNSIGNED NOT NULL,
          from_status    VARCHAR(20) NOT NULL,
          to_status      VARCHAR(20) NOT NULL,
          reason         VARCHAR(32) NOT NULL,
          operator_id    BIGINT UNSIGNED NULL COMMENT '系统自动动作置 NULL',
          created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          KEY idx_apphist_app (application_id, created_at),
          CONSTRAINT fk_apphist_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
          CONSTRAINT fk_apphist_operator    FOREIGN KEY (operator_id)    REFERENCES users(id)        ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE conversations (
          id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_a_id  BIGINT UNSIGNED NOT NULL,
          user_b_id  BIGINT UNSIGNED NOT NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY uq_conv_pair (user_a_id, user_b_id) COMMENT '归一化 user_a < user_b',
          KEY idx_conv_b (user_b_id),
          CONSTRAINT fk_conv_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE RESTRICT,
          CONSTRAINT fk_conv_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE conversation_participants (
          id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          conversation_id      BIGINT UNSIGNED NOT NULL,
          user_id              BIGINT UNSIGNED NOT NULL,
          last_read_message_id BIGINT UNSIGNED NULL COMMENT '未读 = id > 游标 且非本人发送',
          created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          UNIQUE KEY uq_cp (conversation_id, user_id),
          KEY idx_cp_user (user_id),
          CONSTRAINT fk_cp_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )

    op.execute(
        """
        CREATE TABLE messages (
          id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          conversation_id BIGINT UNSIGNED NOT NULL,
          sender_id       BIGINT UNSIGNED NOT NULL,
          content         TEXT NOT NULL,
          created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          KEY idx_msg_conv (conversation_id, id),
          CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """
    )


def downgrade() -> None:
    # 与 upgrade 相反顺序删除
    for table in (
        "messages",
        "conversation_participants",
        "conversations",
        "application_history",
        "applications",
        "position_tags",
        "recruitment_tags",
        "positions",
        "recruitments",
        "tags",
        "users",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table}")
