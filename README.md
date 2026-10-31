# CampusCrew 校园组队互助平台

面向一所学校的校园组队互助与任务型招募匹配平台。学生可以把「需要谁来一起完成什么事」表达成可搜索、带岗位名额和截止时间的招募，通过申请、审核及私信完成匹配。

> 软件工程课程团队项目。对外题目为「招聘网站」，本质是任务型组队匹配，非企业招聘。

## 技术栈

| 层次 | 选型 |
| --- | --- |
| 前端 | React 18 · TypeScript · Vite 5 · react-router-dom 6 · axios · zustand · @tanstack/react-query（手写 CSS，无 UI 库） |
| 后端 | FastAPI · SQLAlchemy 2.0 · Alembic · PyJWT · passlib[bcrypt] · APScheduler |
| 数据库 | MySQL 8 |

## 目录结构

```
campus-match/
├── backend/              # FastAPI 后端
│   ├── app/              # 应用代码（api / core / models / schemas / services / tasks / utils）
│   ├── alembic/          # 数据库迁移
│   ├── tests/            # pytest 测试
│   ├── requirements.txt  # Python 依赖
│   └── .env.example      # 环境变量模板
├── frontend/             # React 前端
│   └── src/              # pages / components / api / hooks / stores / types / styles
├── docs/                 # 设计文档（system_design.md、mvp_spec.md、database-schema.sql 等）
├── doc/                  # 需求基线（decisions / product / requirements / business-rules）
└── 需求文档/              # 课程交付物（SRS、交互原型）
```

## 快速上手

### 0. 前置依赖

- **Python 3.11+**（推荐 3.12/3.13，注意：3.10 及以下不支持，`dataclass(slots=True)` 会报错）
- **Node.js 18+**
- **MySQL 8**（可用 Docker 起容器，见下）

### 1. 启动数据库（Docker 方式，推荐）

```bash
docker run -d --name campus-mysql \
  -e MYSQL_ROOT_PASSWORD=你的密码 \
  -e MYSQL_DATABASE=campuscampus \
  -p 3306:3306 \
  mysql:8.0
```

> 若 Docker 拉镜像失败（国内网络），需先在 Docker Desktop → Settings → Docker Engine 配置镜像加速，`registry-mirrors` 加 `https://docker.m.daocloud.io` 等地址。

容器首次启动约 30~60 秒才就绪。之后用 `docker start campus-mysql` 启动、`docker ps` 查看状态。

### 2. 启动后端

```bash
cd backend

# 创建并激活虚拟环境（Windows PowerShell）
python -m venv .venv
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env   # Windows 用 Copy-Item .env.example .env
```

编辑 `backend/.env`，把 `DATABASE_URL` 改成你自己的连接串：

```
DATABASE_URL=mysql+pymysql://root:你的密码@127.0.0.1:3306/campuscampus?charset=utf8mb4
```

执行迁移建表并启动：

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

看到 `Uvicorn running on http://127.0.0.1:8000` 即成功。

### 3. 启动前端

另开一个终端：

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173 即可。

## 常见问题

### 1. `pip install` 报 `dataclass() got an unexpected keyword argument 'slots'`

说明虚拟环境用的 Python 版本太老（< 3.10）。删除 `.venv`，用 3.11+ 重建：

```bash
python -m venv .venv   # 确保 python --version 是 3.11+
```

若系统默认 `python` 是旧版（如 Anaconda 3.9），用明确路径：`py -3.12 -m venv .venv`。

### 2. 前端页面「加载失败」，后端返回 500

大概率是 Vite 代理把 `localhost` 解析成了 IPv6 `::1`，而后端只监听 IPv4 `127.0.0.1`。检查 `frontend/vite.config.ts` 的代理 target 是否为 `http://127.0.0.1:8000`（而非 `localhost`）。

### 3. 注册时提示邮箱不合法

校园邮箱域名白名单由 `.env` 的 `ALLOWED_EMAIL_DOMAINS` 控制，默认是占位值 `@stu.example.edu`，注册时邮箱需以该域名结尾。

## 运行测试

后端测试（需配好 MySQL 的 `TEST_DATABASE_URL`）：

```bash
cd backend
pytest
```

核心并发用例（`test_application_concurrency.py`）需在真实 MySQL 8 环境运行，SQLite 不支持 `FOR UPDATE` 锁与生成列，无法等价验证。
