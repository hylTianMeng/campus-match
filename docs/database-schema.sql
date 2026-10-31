-- =====================================================================
-- CampusCrew 校园组队互助平台 — MySQL 8.0 建表 DDL
-- 版本：1.0（架构设计基线）
-- 字符集：utf8mb4；排序规则：utf8mb4_0900_ai_ci
-- 时间策略：统一 UTC 存储，DATETIME(3) 毫秒精度（TD-02 建议）
-- 说明：
--   1) 所有业务"删除"默认软删除（status/deleted_at/is_active），保证历史与治理可追溯。
--   2) 并发一致性（BR-05）通过 MySQL 8 生成列 + 部分唯一索引实现（见 applications 表）。
--   3) 本 DDL 为权威结构，Alembic 迁移需与此保持一致。
-- =====================================================================

CREATE DATABASE IF NOT EXISTS campuscrew
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE campuscrew;

-- ---------------------------------------------------------------------
-- 1. 用户（账号 + 个人资料 + 隐私开关 + 认证/封禁/注销状态）
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email                 VARCHAR(255)    NOT NULL COMMENT '校园邮箱，标准化后唯一（trim+lowercase）',
  password_hash         VARCHAR(255)    NOT NULL COMMENT 'bcrypt 摘要',
  nickname              VARCHAR(50)     NOT NULL COMMENT '必填昵称',
  avatar_url            VARCHAR(512)    NULL,
  department            VARCHAR(100)    NULL COMMENT '院系（选填）',
  grade                 VARCHAR(32)     NULL COMMENT '年级（选填）',
  bio                   VARCHAR(500)    NULL COMMENT '个人简介（选填）',
  is_verified           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否完成校园邮箱验证码认证',
  status                ENUM('active','banned','deleted') NOT NULL DEFAULT 'active' COMMENT '账号状态',
  searchable            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '允许被搜索',
  show_my_recruitments  TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '公开我的发布',
  show_my_applications  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '公开我的申请',
  show_my_teams         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '公开我的队伍',
  token_version         INT             NOT NULL DEFAULT 0 COMMENT 'JWT 撤销版本号（登出/封禁/改密/注销时 +1）',
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at            DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status),
  KEY idx_users_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户账号与个人资料';

-- ---------------------------------------------------------------------
-- 2. 邮箱验证码（注册认证 / 重置密码共用；哈希存储，防爆破）
-- ---------------------------------------------------------------------
CREATE TABLE email_verification_codes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email       VARCHAR(255)    NOT NULL,
  code_hash   CHAR(64)        NOT NULL COMMENT 'SHA-256(验证码+盐)',
  purpose     ENUM('register','reset_password') NOT NULL DEFAULT 'register',
  expires_at  DATETIME(3)     NOT NULL,
  attempts    INT             NOT NULL DEFAULT 0 COMMENT '已尝试次数，上限 5',
  used_at     DATETIME(3)     NULL,
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_evc_email_purpose (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='邮箱验证码（不保存明文）';

-- ---------------------------------------------------------------------
-- 3. 一级分类（系统预设，管理员维护）
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)     NOT NULL,
  sort_order INT             NOT NULL DEFAULT 0,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='招募一级分类';

-- ---------------------------------------------------------------------
-- 4. 标签（技能/兴趣/招募三类；管理员维护、合并）
-- ---------------------------------------------------------------------
CREATE TABLE tags (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(50)     NOT NULL,
  kind       ENUM('skill','interest','recruitment') NOT NULL,
  is_active  TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '合并/停用后置 0，不物理删除',
  created_by BIGINT UNSIGNED NULL COMMENT '创建者（用户自建标签）',
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tags_name_kind (name, kind),
  KEY idx_tags_kind (kind),
  CONSTRAINT fk_tags_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技能/兴趣/招募标签';

-- ---------------------------------------------------------------------
-- 5. 用户-标签关联（技能与兴趣标签）
-- ---------------------------------------------------------------------
CREATE TABLE user_tags (
  user_id    BIGINT UNSIGNED NOT NULL,
  tag_id     BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, tag_id),
  KEY idx_user_tags_tag (tag_id),
  CONSTRAINT fk_user_tags_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_tags_tag  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户技能/兴趣标签';

-- ---------------------------------------------------------------------
-- 6. 招募-标签关联
-- ---------------------------------------------------------------------
CREATE TABLE recruitment_tags (
  recruitment_id BIGINT UNSIGNED NOT NULL,
  tag_id         BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (recruitment_id, tag_id),
  KEY idx_recruitment_tags_tag (tag_id),
  CONSTRAINT fk_rt_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE CASCADE,
  CONSTRAINT fk_rt_tag         FOREIGN KEY (tag_id)         REFERENCES tags(id)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='招募自由标签';

-- ---------------------------------------------------------------------
-- 7. 岗位-技能标签关联
-- ---------------------------------------------------------------------
CREATE TABLE position_tags (
  position_id BIGINT UNSIGNED NOT NULL,
  tag_id      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (position_id, tag_id),
  KEY idx_position_tags_tag (tag_id),
  CONSTRAINT fk_pt_position FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag      FOREIGN KEY (tag_id)      REFERENCES tags(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='岗位技能标签';

-- ---------------------------------------------------------------------
-- 8. 招募（生命周期 status/end_reason 与 独立下架标记分离）
--    正常结束统一 ended + end_reason ∈ {filled,expired,manual}（BR-09）
--    下架(is_taken_down)/封禁(owner 的 status) 为独立限制，不覆盖生命周期
-- ---------------------------------------------------------------------
CREATE TABLE recruitments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id          BIGINT UNSIGNED NOT NULL,
  category_id       BIGINT UNSIGNED NOT NULL,
  title             VARCHAR(100)    NOT NULL,
  description       TEXT            NOT NULL,
  location          VARCHAR(100)    NULL,
  activity_time     VARCHAR(100)    NULL COMMENT '活动时间，MVP 用文本/时间范围展示',
  deadline_at       DATETIME(3)     NOT NULL COMMENT '截止时间（发布时必须未来）',
  status            ENUM('draft','open','ended') NOT NULL DEFAULT 'draft',
  end_reason        ENUM('filled','expired','manual') NULL COMMENT '仅 ended 时填写',
  ended_at          DATETIME(3)     NULL,
  published_at      DATETIME(3)     NULL,
  is_taken_down     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '管理员独立下架（可恢复）',
  taken_down_at     DATETIME(3)     NULL,
  taken_down_reason VARCHAR(255)    NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_recruitments_owner (owner_id),
  KEY idx_recruitments_category (category_id),
  KEY idx_recruitments_status_deadline (status, deadline_at),
  KEY idx_recruitments_published (status, published_at, id),
  KEY idx_recruitments_owner_status (owner_id, status),
  CONSTRAINT fk_recruitments_owner    FOREIGN KEY (owner_id)    REFERENCES users(id)      ON DELETE RESTRICT,
  CONSTRAINT fk_recruitments_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='招募需求';

-- ---------------------------------------------------------------------
-- 9. 岗位（独立名额；accepted_count 为派生值不落库）
-- ---------------------------------------------------------------------
CREATE TABLE positions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recruitment_id BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(50)     NOT NULL,
  capacity       INT             NOT NULL COMMENT '招募人数，正整数',
  description    VARCHAR(500)    NULL,
  sort_order     INT             NOT NULL DEFAULT 0,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_positions_recruitment (recruitment_id),
  CONSTRAINT chk_positions_capacity CHECK (capacity > 0),
  CONSTRAINT fk_positions_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='岗位与名额';

-- ---------------------------------------------------------------------
-- 10. 申请（含并发一致性生成列，落地 BR-05）
--     pending_guard：同岗位同用户最多一条 pending（部分唯一）
--     accepted_guard：同招募同用户最多一条 accepted（部分唯一，BR-05/BR-06）
--     MySQL 唯一索引允许多个 NULL，故用生成列把"非目标状态"置 NULL。
-- ---------------------------------------------------------------------
CREATE TABLE applications (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recruitment_id BIGINT UNSIGNED NOT NULL,
  position_id    BIGINT UNSIGNED NOT NULL,
  applicant_id   BIGINT UNSIGNED NOT NULL,
  message        VARCHAR(500)    NULL COMMENT '申请留言（选填）',
  status         ENUM('pending','accepted','not_passed','withdrawn','expired') NOT NULL DEFAULT 'pending',
  reason         ENUM('submitted','approved','rejected','applicant_withdrawn','accepted_other_position','capacity_full','blocked','deadline_reached','manual_end','offer_revoked','offer_abandoned') NOT NULL DEFAULT 'submitted',
  pending_guard  BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'pending'  THEN applicant_id ELSE NULL END) STORED,
  accepted_guard BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'accepted' THEN applicant_id ELSE NULL END) STORED,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  decided_at     DATETIME(3)     NULL,
  PRIMARY KEY (id),
  KEY idx_applications_recruitment (recruitment_id),
  KEY idx_applications_position (position_id),
  KEY idx_applications_applicant (applicant_id),
  KEY idx_applications_position_status (position_id, status),
  UNIQUE KEY uq_applications_pending  (position_id, pending_guard),
  UNIQUE KEY uq_applications_accepted (recruitment_id, accepted_guard),
  CONSTRAINT fk_applications_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_applications_position    FOREIGN KEY (position_id)    REFERENCES positions(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_applications_applicant   FOREIGN KEY (applicant_id)   REFERENCES users(id)        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请记录（每次提交与状态变化留存，重新申请新增记录）';

-- ---------------------------------------------------------------------
-- 11. 申请操作历史（追加式，拒绝/撤销/满员等动作与原因分离，BR/审计）
-- ---------------------------------------------------------------------
CREATE TABLE application_history (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  from_status    VARCHAR(20)     NOT NULL,
  to_status      VARCHAR(20)     NOT NULL,
  reason         VARCHAR(32)     NOT NULL,
  operator_id    BIGINT UNSIGNED NULL COMMENT '操作者；系统自动动作置 NULL',
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_application_history_app (application_id, created_at),
  CONSTRAINT fk_apphist_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_apphist_operator    FOREIGN KEY (operator_id)    REFERENCES users(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='申请状态变更历史（追加）';

-- ---------------------------------------------------------------------
-- 12. 收藏
-- ---------------------------------------------------------------------
CREATE TABLE favorites (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  recruitment_id BIGINT UNSIGNED NOT NULL,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_favorites_user_rec (user_id, recruitment_id),
  KEY idx_favorites_recruitment (recruitment_id),
  CONSTRAINT fk_favorites_user        FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT fk_favorites_recruitment FOREIGN KEY (recruitment_id) REFERENCES recruitments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='招募收藏';

-- ---------------------------------------------------------------------
-- 13. 用户级黑名单（有方向）
-- ---------------------------------------------------------------------
CREATE TABLE blacklists (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blocker_id BIGINT UNSIGNED NOT NULL COMMENT '拉黑者',
  blocked_id BIGINT UNSIGNED NOT NULL COMMENT '被拉黑者',
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_blacklists_pair (blocker_id, blocked_id),
  KEY idx_blacklists_blocked (blocked_id),
  CONSTRAINT fk_blacklists_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_blacklists_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户级黑名单（单向）';

-- ---------------------------------------------------------------------
-- 14. 会话（归一化：约定 user_a_id < user_b_id，保证一对一唯一）
-- ---------------------------------------------------------------------
CREATE TABLE conversations (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_a_id  BIGINT UNSIGNED NOT NULL,
  user_b_id  BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_conversations_pair (user_a_id, user_b_id),
  KEY idx_conversations_b (user_b_id),
  CONSTRAINT fk_conversations_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_conversations_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一对一私信会话';

-- ---------------------------------------------------------------------
-- 15. 会话参与者（每人自己的已读游标 + 隐藏会话标记）
-- ---------------------------------------------------------------------
CREATE TABLE conversation_participants (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id     BIGINT UNSIGNED NOT NULL,
  user_id             BIGINT UNSIGNED NOT NULL,
  last_read_message_id BIGINT UNSIGNED NULL COMMENT '已读游标，未读 = id > 游标 且 非本人发送',
  is_hidden           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '隐藏会话（收到新消息后建议自动取消隐藏）',
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_conv_participant (conversation_id, user_id),
  KEY idx_conv_participant_user (user_id),
  CONSTRAINT fk_cp_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_user         FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话参与者与已读/隐藏状态';

-- ---------------------------------------------------------------------
-- 16. 私信消息（服务器保留正文，不做双方撤回）
-- ---------------------------------------------------------------------
CREATE TABLE messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id       BIGINT UNSIGNED NOT NULL,
  content         TEXT            NOT NULL,
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_messages_conversation (conversation_id, id),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender       FOREIGN KEY (sender_id)       REFERENCES users(id)        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='私信正文（个人侧删除仅标记，服务器保留）';

-- ---------------------------------------------------------------------
-- 17. 消息个人侧删除标记（不影响对方）
-- ---------------------------------------------------------------------
CREATE TABLE message_deletes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  deleted_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_message_deletes (message_id, user_id),
  KEY idx_message_deletes_user (user_id),
  CONSTRAINT fk_md_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_md_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息个人侧删除';

-- ---------------------------------------------------------------------
-- 18. 系统通知（站内；dedup_key 幂等，事件失败可重试不重复）
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_id  BIGINT UNSIGNED NOT NULL,
  event_type    VARCHAR(50)     NOT NULL COMMENT 'application_accepted 等',
  summary       VARCHAR(255)    NOT NULL,
  resource_type VARCHAR(32)     NULL,
  resource_id   BIGINT UNSIGNED NULL,
  link          VARCHAR(255)    NULL COMMENT '安全链接，访问时重新鉴权',
  is_read       TINYINT(1)      NOT NULL DEFAULT 0,
  read_at       DATETIME(3)     NULL,
  dedup_key     CHAR(64)        NOT NULL COMMENT 'SHA-256(event_id + recipient_id) 幂等键',
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_dedup (dedup_key),
  KEY idx_notifications_recipient (recipient_id, is_read, id),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系统通知';

-- ---------------------------------------------------------------------
-- 19. 举报（仅提交不自动处罚；人工处置）
-- ---------------------------------------------------------------------
CREATE TABLE reports (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id       BIGINT UNSIGNED NOT NULL,
  target_type       ENUM('recruitment','user','message') NOT NULL,
  target_id         BIGINT UNSIGNED NOT NULL,
  reason            VARCHAR(500)    NOT NULL,
  evidence_snapshot JSON            NULL COMMENT '举报时目标内容快照（TD-10 建议）',
  status            ENUM('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
  resolution        VARCHAR(500)    NULL,
  resolved_by       BIGINT UNSIGNED NULL,
  resolved_at       DATETIME(3)     NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reports_status (status, created_at),
  KEY idx_reports_target (target_type, target_id),
  KEY idx_reports_reporter (reporter_id),
  CONSTRAINT fk_reports_reporter  FOREIGN KEY (reporter_id)  REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reports_resolved  FOREIGN KEY (resolved_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='举报工单';

-- ---------------------------------------------------------------------
-- 20. 管理操作审计（追加式，应用层禁止 UPDATE/DELETE）
--    覆盖：封禁/解封、下架/恢复、举报处置、标签合并等
-- ---------------------------------------------------------------------
CREATE TABLE admin_audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operator_id  BIGINT UNSIGNED NOT NULL,
  action       VARCHAR(50)     NOT NULL COMMENT 'ban/unban/takedown/restore/report_resolve/tag_merge/...',
  target_type  VARCHAR(32)     NOT NULL,
  target_id    BIGINT UNSIGNED NULL,
  reason       VARCHAR(500)    NULL COMMENT '封禁/下架等必填原因',
  before_state JSON            NULL,
  after_state  JSON            NULL,
  detail       JSON            NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_admin_audit_operator (operator_id, created_at),
  KEY idx_admin_audit_target (target_type, target_id),
  CONSTRAINT fk_admin_audit_operator FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理操作审计（不可改删）';

-- ---------------------------------------------------------------------
-- 21. 私信访问审计（BR-17 / DEC-056~057；先留痕再返回正文；不可改删）
-- ---------------------------------------------------------------------
CREATE TABLE private_message_access_audits (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id        BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  reason          VARCHAR(500)    NOT NULL COMMENT '访问原因（必填）',
  request_id      CHAR(36)        NOT NULL COMMENT '同一次分页访问复用的审计令牌',
  created_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pm_audit_request (request_id),
  KEY idx_pm_audit_admin (admin_id, created_at),
  KEY idx_pm_audit_conv (conversation_id),
  CONSTRAINT fk_pm_audit_admin        FOREIGN KEY (admin_id)        REFERENCES users(id)         ON DELETE RESTRICT,
  CONSTRAINT fk_pm_audit_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员私信访问审计（不可改删）';
