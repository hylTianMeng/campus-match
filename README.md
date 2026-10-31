# CampusCrew / Campus Match

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

需要 **Node.js 22.12+、npm、Python 3.9+**（新环境推荐 Python 3.12）。以下命令从仓库根目录开始。

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

开发数据库默认保存在 `backend/data/campuscrew.sqlite3`，重启后保留数据，不提交到 Git。
`app.seed` 只在没有用户时添加演示账号和六条原型招募，不覆盖已有业务数据；它不会随服务启动自动执行。

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

## 初版已实现

- 真实登录/退出，密码散列、HttpOnly Cookie 会话、服务端权限校验。
- 发现页分类分区、关键词搜索、分类筛选、最新/截止排序、公开详情。
- 多岗位发布、缺项草稿保存/恢复/删除、一般信息编辑、删除规则、提前结束。
- 联系方式、活动介绍、导师、预期成果、活动/附件参考链接等可选字段。
- 岗位申请、补充留言/经历/作品链接、撤回、拒绝、录取、撤销录取、放弃录取。
- 同一招募最多录取一个岗位；满岗自动拒绝剩余待审，全部满员立即结束。
- SQLite 事务控制名额；到期自动结束和申请过期；通知与操作历史。
- 我的发布、申请、组队历史、收藏；资料编辑、同学搜索、主页隐私。
- 文字私信、会话列表、内部已读、通知已读、10 秒轮询未读数量。
- 原静态页面中的申请补充资料始终私有，仅本人和招募发布者可读取。

## 后续范围与当前边界

这是可运行的学生端初版，**尚未实现完整管理后台和全部 MVP 功能**：

- 校园邮件注册/验证码/找回密码、头像上传、账号注销。
- 五类管理后台、举报、拉黑、管理员访问审计和分类标签维护。
- 私信仅自己删除/隐藏会话、复杂组合筛选及完整分页 UI。
- 自动化迁移框架、生产部署配置、生产监控与跨实例任务调度。

上述功能没有伪装成成功的按钮。分类由种子脚本初始化；当前没有开放用户自行认证或提权的接口。

招募默认列表首批最多 100 条（API 支持 `limit/offset`），同学搜索最多 100 条，通知列表最近 200 条；私信按每批 200 条拉取完整会话。规模扩大时需补充分页/虚拟列表。

原需求尚未定稿的状态处理采取保守实现：存在待审核申请时阻止手动结束，已结束招募禁止编辑，暂停/封禁用户不可写入。详细边界见 [架构与范围](doc/06-architecture.md)。

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

配置通过 shell 环境变量传入，参考 `backend/.env.example`；应用不会隐式读取 `.env`。

- `DATABASE_PATH`：SQLite 文件路径，推荐绝对路径。
- `ALLOWED_ORIGINS`：允许浏览器写入的来源，逗号分隔；默认仅本地开发地址。
- `COOKIE_SECURE=1`：HTTPS 部署时启用 Secure Cookie。
- `SEED_PASSWORD`：首次导入开发账号使用的密码。

开发时 Vite 将 `/api` 代理到本机 8000 端口。生产构建命令 `npm run build` 只生成 `frontend/dist/`，正式部署应由同域反向代理分别提供静态文件与 `/api`，并设置 HTTPS 与来源白名单。

## 原始资料

- [产品决策](doc/00-decisions.md) · [产品定义](doc/01-product.md) · [业务规则](doc/03-business-rules.md)
- [较小静态原型](static-page/README.md)
- [完整静态原型](static-page-complete/README.md)
