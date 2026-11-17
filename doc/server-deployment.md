# A7 服务器部署

部署日期为 2026 年 11 月 17 日。

## 访问与版本

- 应用地址为 http://82.157.161.154:8081/ 。
- 健康检查地址为 http://82.157.161.154:8081/api/health 。
- SSH 用户为 `ubuntu`，端口为 `22`。
- 当前发布编号为 `20261117-162315`，代码来自合并后的 `develop` 提交，具体提交记录在服务器发布目录的 `release.json`。
- 当前通过 HTTP 访问。HTTPS 证书尚未配置。
- 邮件验证码发送与邮件找回密码暂时返回服务未配置提示，配置 SMTP 后启用。

## 运行结构

Nginx 在 8081 端口提供前端静态文件，将 `/api/` 转发至监听本机 `127.0.0.1:8017` 的 FastAPI 服务。

后端使用独立 Python 3.12 虚拟环境、单进程 Uvicorn 和 SQLite。systemd 管理进程，已启用开机启动与异常退出自动重启。

| 内容 | 服务器路径或名称 |
| --- | --- |
| 后端服务 | `campus-match-a7.service` |
| 当前代码 | `/home/ubuntu/campus-match/current/backend` |
| 代码发布目录 | `/home/ubuntu/campus-match/releases/` |
| 当前前端 | `/var/www/campus-match/current` |
| 前端发布目录 | `/var/www/campus-match/releases/` |
| SQLite 数据库 | `/home/ubuntu/campus-match/shared/campuscrew.sqlite3` |
| 头像目录 | `/home/ubuntu/campus-match/shared/avatars/` |
| 环境变量 | `/home/ubuntu/campus-match/shared/app.env` |
| 初始化账号凭据 | `/home/ubuntu/campus-match/shared/initial-accounts.json`，权限为 `600` |
| Nginx 配置 | `/etc/nginx/sites-available/campus-match-a7` |
| Nginx 请求日志 | `/var/log/nginx/campus-match-a7.access.log` |
| Nginx 错误日志 | `/var/log/nginx/campus-match-a7.error.log` |

数据库与头像使用持久化目录，更新发布目录时继续使用这些数据。首次部署初始化了五个招募分类、一个 A7 管理员和两个测试账号。

## 常用维护命令

以下命令在 SSH 登录服务器后执行。

```sh
sudo systemctl status campus-match-a7 --no-pager
sudo journalctl -u campus-match-a7 -n 100 --no-pager
sudo systemctl restart campus-match-a7
curl --noproxy '*' -fsS http://127.0.0.1:8081/api/health
sudo nginx -t
```

更新版本时上传新的前端构建产物和后端代码到对应发布目录，为后端创建独立虚拟环境并安装 `backend/requirements.txt`，随后更新两个 `current` 链接并重启后端。部署沿用现有数据库、头像目录和账号密码。更新发布时不执行账号初始化或种子脚本。

## 配置邮件服务

在 `shared/app.env` 中填入 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD` 与 `MAIL_FROM`，保留 `SMTP_ENABLED=1`。当前邮件实现要求 SMTP 支持 STARTTLS，通常使用 587 端口。

配置并测试邮件发送后，移除本项目 Nginx 配置中 `/api/auth/verify/send` 与 `/api/auth/reset/request` 两个返回 503 的精确匹配段，执行 `sudo nginx -t`，随后重新加载 Nginx 并重启后端。

## 部署验证

- 公网首页与 `/api/health` 返回 200。
- 浏览器验证两个测试账号登录、私信发送与接收、附件分享菜单和回形针图标。
- 管理员账号可访问举报管理接口。
- 手机端聊天页面无横向溢出。

本次发布包含会话未读数、固定聊天区与自动滚动、发送状态恢复、双向私信拉黑、管理员拉黑权限限制及页面空状态清理。发布使用已提交的 `develop` 代码。
