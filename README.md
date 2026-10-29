# CampusCrew 校园组队平台

第一阶段演示版：React + TypeScript + Vite、FastAPI + SQLAlchemy、SQLite。

## 本地启动

需要 Python 3.12+、Node.js 20.19+（或 22.12+）。在仓库根目录：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
npm ci --prefix frontend
```

启动后端：

```bash
cd backend
CAMPUS_EMAIL_DOMAINS=example.edu ../.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

另一个终端启动前端：

```bash
cd frontend
npm run dev
```

浏览器访问 Vite 输出的地址。前端通过 Vite 将 `/api` 转发到后端。接口文档由后端 `/docs` 提供。

## 演示流程

1. 使用 `owner@example.edu` 注册，密码至少 8 位，然后登录。
2. 在后端工作目录 `mail-outbox/` 中找到对应邮件，复制六位验证码完成认证。
3. 发布含一个或多个岗位的招募，截止时间选择未来时间。
4. 退出，注册并认证另一个账号，浏览招募并申请岗位。
5. 重新登录发布者，在“审核申请”录取或拒绝，在“我的发布”查看招募。

验证码十分钟有效，最多五次错误尝试。默认仅允许 `example.edu`；通过 `CAMPUS_EMAIL_DOMAINS` 配置学校域名，多个用逗号分隔。邮件目前写入受权限保护的本地文件，不会发送真实邮件；正式部署需要接入邮件服务及发送/登录频率限制。

会话令牌保存在浏览器 sessionStorage，24 小时有效，退出立即失效。密码使用随机盐和 scrypt 存储。SQLite 文件默认在后端工作目录，通过 `DATABASE_URL` 可调整路径。数据库、邮件和凭据均不提交到 Git。

## 验证

```bash
cd backend
../.venv/bin/pytest -q
cd ../frontend
npm run build
```

测试覆盖注册认证、权限、申请去重、禁止自申请、录取联动、满员结束、截止过期及退出会话失效。到期状态由请求时检查并持久化，尚未增加后台调度。

## 实现范围与设计取舍

已实现注册/登录/邮箱认证、招募列表与搜索、详情、多岗位发布、岗位申请、审核录取、我的发布和我的申请。SQLite `BEGIN IMMEDIATE` 序列化写事务，录取及关联状态更新原子提交。

第一阶段不包含文档中后续的私信、通知、收藏、黑名单、后台管理、找回密码、草稿、编辑/删除、撤回/放弃录取与手动结束。分类暂定为学习互助、竞赛组队、校园活动、兴趣交流；认证采用开发邮件目录。已有录取者不得再申请同一招募，发布者不得申请自身招募。这些是第一阶段技术选择，不替代产品决策。

这是开发演示版本：正式上线前需增加真实邮件、验证码重发、请求限流、HTTPS、安全会话部署策略及数据库迁移流程。不要直接公开部署开发服务。
