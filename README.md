# TsingMate / Campus Match

开发协作遵循 [AGENTS.md](AGENTS.md)。产品、功能进展、架构和本地测试文档统一保存在 `doc/`，阅读入口见 [文档目录](doc/README.md)。

## macOS 本地部署与测试

本机环境已配置。访问 <http://127.0.0.1:5173/>，按 [本地运行与测试指南](doc/local-testing.md) 使用开发账号测试。

在仓库根目录执行以下命令管理本地服务及测试。

```bash
python3 scripts/local.py start
python3 scripts/local.py status
python3 scripts/local.py test
python3 scripts/local.py stop
```

## Windows / Conda 快速启动

在项目根目录执行（需要 Node.js 22.12+）：

```powershell
conda env create --prefix .conda --file environment.yml
.\.conda\python.exe -m pip install -r backend\requirements-dev.txt
Push-Location backend
..\.conda\python.exe -m app.seed
..\.conda\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个 PowerShell 窗口，在项目根目录执行：

```powershell
Push-Location frontend
npm.cmd ci
npm.cmd run dev
```

访问 <http://127.0.0.1:5173/>，API 文档位于 <http://127.0.0.1:8000/docs>。
如 Vite 在受限目录下加载配置或预构建依赖时报权限错误，可运行
`npm.cmd run build -- --configLoader runner`，再运行
`npm.cmd run preview -- --configLoader runner` 来预览构建结果。

校园组队平台的初版代码，技术栈为 **React + TypeScript + FastAPI + SQLite**。
页面沿用 `static-page-complete/dist` 当前静态原型的布局和样式；原型独立保留，不参与应用运行。

## 目录

```text
frontend/                 React 19 + TypeScript + Vite
  src/components/         布局、导航、卡片、弹窗等公共组件
  src/pages/              发现、详情、发布、个人中心、消息等页面
  src/api.ts              API 客户端、加载/错误状态、轮询
  src/context.tsx         当前会话与操作反馈
  e2e/                    浏览器端完整流程测试
backend/                  FastAPI + Python sqlite3
  app/routers/            账户、招募申请、同学消息 HTTP 接口
  app/services.py         申请审核与招募状态转换
  app/db.py               SQLite 事务、数据库连接、截止处理
  app/schema.sql          v1 数据结构与约束
  app/schemas.py          请求校验
  app/auth.py             密码校验、会话与权限依赖
  app/seed.py              显式导入本地开发数据
  tests/                  API、权限和并发集成测试
scripts/e2e_server.py      使用临时数据库启动测试后端
```

## 本地启动

需要 **Node.js 22.12+、npm、Python 3.10+**（新环境推荐 Python 3.12）。以下命令从仓库根目录开始。

终端一，启动后端：

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
.venv/bin/python -m app.seed
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

终端二，启动前端：

```bash
cd frontend
npm ci
npm run dev
```

- 页面：<http://127.0.0.1:5173>
- API 文档：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/api/health>

开发数据库默认保存在 `backend/data/campuscrew.sqlite3`，重启后保留数据，不提交到 Git。招募附件及个人主页附件也保存在此数据库中；备份或迁移时需一并保留。
`app.seed` 只在没有用户时添加演示账号、六条原型招募和一条完整功能示例（含岗位、附件及申请状态），不覆盖已有业务数据；它不会随服务启动自动执行。

### 本地开发账号

以下是明确创建的虚构测试账号，不发送真实邮件，不代表真实校园认证：

| 邮箱 | 姓名 | 用途 |
| --- | --- | --- |
| `lin@example.test` | 林知夏 | 申请者，也有自己的招募 |
| `chen@example.test` | 陈书宁 | 发布者，测试审核 |
| `shen@example.test` | 沈亦舟 | 第二位申请者 |
| `zhou@example.test` | 周映雪 | 同学与消息测试 |

默认密码均为 `CampusCrew-Dev-2026`。可在首次执行种子脚本时用 `SEED_PASSWORD` 环境变量替换。种子账号仅用于本地开发，不应导入生产环境。

建议先用陈书宁发布新招募，再在浏览器无痕窗口用林知夏申请，回到陈书宁账号审核。

## 已实现功能

- 校园邮箱注册、密码登录退出、验证码认证、密码找回与会话管理，当前本地采用开发验证码。
- 个人资料、头像上传删除、用户搜索、公开范围和账号匿名化注销。
- 在个人资料中添加最多 20 项网页链接或附件，自定义标题后保存到对外主页；认证同学可查看和下载。附件支持 PDF、DOCX、PNG、JPG、TXT，每个最多 5 MB，移除并保存后停止提供下载。
- 后台用户检索、封禁解封、处罚记录及站内通知。
- 发现页关键词、分类和精确标签组合搜索，两种时间排序，搜索时优先标签相关度。
- 自动及手动草稿、恢复删除、复制为独立新招募草稿。
- 进行中的招募可修改分类、岗位、名额和活动安排，截止仅可延长，容量不能低于已录取人数。有申请历史的岗位可停止接收申请。
- 已结束招募可修正说明、联系方式和补充资料，录取结果锁定。
- 最多 20 项自定义文字、网址或附件信息，单附件最多 5 MB，支持 PDF、DOCX、PNG、JPG、TXT，保留旧字段与附件兼容。
- 申请、审核、撤回、拒绝、录取、撤销和放弃，以及申请事件、名额、截止和满员联动。
- 收藏、申请与组队历史、文字私信、系统通知、内部已读及约 10 秒未读轮询。
- 申请留言、经历及简历或作品链接仅本人及对应发布者可查看。

- 私信支持安全重试、链接分享、个人删除隐藏，黑名单接入跨招募申请与私信限制。
- 举报提交、人工处置、安全通知、独立下架恢复及处罚历史已有端到端页面。
- 管理员按原因访问私信，分页授权 15 分钟，访问审计只读并由数据库触发器保护。

## 后续工作与当前边界

- 分类标签维护后台及完整筛选分页体验继续完善。
- 正式部署的数据保留与维护方案继续完善。
- 招募地点和截止区间筛选、完整分页界面。
- 真实 SMTP 配置验证及注销关联业务的后续产品调整。
- 有序数据库迁移、生产部署监控及跨实例任务调度。

有待审核申请时，当前先处理完待审才允许手动结束。`public_posts` 当前影响大厅及普通用户详情访问，相关代码标注待组长确认，其他历史与下载入口也需统一可见性。详细规则见 [业务规则](doc/03-business-rules.md)。

招募列表 API 支持 `limit/offset`，默认最多 100 条。同学搜索最多 100 条，通知最近 200 条，私信按每批 200 条连续拉取。

消息与治理的逐项实现状态见 [临时清单](TEMP-message-governance-checklist.md)。

## 验证

```bash
# API、权限及真实 SQLite 并发测试
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
cd backend
.venv/bin/python -m pytest -q
```

```bash
# 在另一个终端中，从仓库根目录开始
cd frontend
npm run build
npm run test:e2e
```

浏览器测试默认使用本机 Google Chrome；测试会自行启动独立的 8001/5174 端口，运行前请停止占用这两个端口的开发服务。测试使用独立临时数据库，不接触开发数据。没有 Chrome 时可修改 `playwright.config.ts`，去掉 `channel: 'chrome'` 并执行 `npx playwright install chromium`。

## 配置

后端启动会自动读取工作目录中的 `.env`，shell 环境变量优先。参考 `backend/.env.example`，本机配置保存在 `backend/.env`。

- `DATABASE_PATH`：SQLite 文件路径，推荐绝对路径。
- `ALLOWED_ORIGINS`：允许浏览器写入的来源，逗号分隔；默认仅本地开发地址。
- `COOKIE_SECURE=1`：HTTPS 部署时启用 Secure Cookie。
- `SEED_PASSWORD`：首次导入开发账号使用的密码。

开发时 Vite 将 `/api` 代理到本机 8000 端口。生产构建命令 `npm run build` 只生成 `frontend/dist/`，正式部署应由同域反向代理分别提供静态文件与 `/api`，并设置 HTTPS 与来源白名单。

## 文档与原型

- [产品、进展、架构与测试文档](doc/README.md)
- [较小静态原型](static-page/README.md)
- [完整静态原型](static-page-complete/README.md)
