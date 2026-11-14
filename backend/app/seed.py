"""Explicit local development data; never seeds during application startup."""

import json
import os
from datetime import datetime, timezone, timedelta
from .db import init_db, connect, now
from .auth import hash_password

CATEGORIES = ["学科竞赛", "课程项目", "学术科研", "兴趣活动", "公益实践"]
TITLES = [
    "校园碳足迹地图 · 挑战杯共创计划",
    "软件工程大作业 · 校园互助平台",
    "让古籍里的文字重新被看见",
    "周末紫荆摄影散步计划",
    "用机器学习读懂城市的呼吸",
    "无障碍校园地图 · 用户研究",
]
TAGS = [
    ["产品设计", "Python", "数据分析"],
    ["React", "Java", "UI 设计"],
    ["数字人文", "OCR", "文献研究"],
    ["摄影", "校园记录"],
    ["机器学习", "遥感"],
    ["用户研究", "无障碍"],
]

SHOWCASE_TITLE = "【功能示例】TsingMate 校园协作体验营｜跨学科伙伴招募"


def seed_showcase(db):
    """Add one complete, clearly labelled example to a fresh demo database."""
    created_at = now()
    deadline = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    event_time = (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()
    owner_id = db.execute(
        "SELECT id FROM users WHERE email=?", ("zhou@example.test",)
    ).fetchone()["id"]
    extras = {
        "items": [
            {
                "title": "参与方式与时间投入",
                "type": "text",
                "content": "每周约 3–5 小时，周末一次讨论。欢迎跨学科、零基础同学参与。",
                "attachment_id": None,
            },
            {
                "title": "预期成果与收获",
                "type": "text",
                "content": "完成可运行原型、产品演示和协作复盘。本示例不承诺学分、证书或报酬。",
                "attachment_id": None,
            },
            {
                "title": "外部参考链接（演示）",
                "type": "link",
                "content": "https://www.google.com/",
                "attachment_id": None,
            },
        ],
        "contact": "站内私信周映雪；tsingmate-demo@example.test（演示邮箱）",
    }
    post_id = db.execute(
        "INSERT INTO posts(owner_id,title,category,description,tags,place,deadline,event_time,extras,created_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            owner_id,
            SHOWCASE_TITLE,
            "课程项目",
            "这是一个覆盖招募、岗位、标签、自定义信息和附件展示的完整功能示例。\n\n"
            "我们希望邀请不同学科的同学，合作完成一个小型校园协作产品原型。"
            "无论擅长开发、设计、沟通，还是希望从零参与真实项目，都可以选择适合自己的岗位。\n\n"
            "项目分为需求讨论与用户研究、原型设计与实现、成果展示与复盘三个阶段。"
            "每周投入约 3–5 小时，以周末讨论和异步协作为主。\n\n"
            "申请时请介绍可投入时间、相关经历和想负责的方向。作品链接可选，"
            "申请补充资料仅申请者本人及发布者可见。\n\n"
            "【演示提示】本帖及申请记录都是演示数据，可体验标签搜索、收藏、岗位申请、"
            "管理名额及复制为新招募。视觉设计岗位暂停接收申请；其他岗位仍开放。",
            json.dumps(["跨学科合作", "零基础友好", "周末活动", "校园产品", "React", "Python"], ensure_ascii=False),
            "校内公共讨论空间（房间待确认）／支持线上协作",
            deadline,
            event_time,
            json.dumps(extras, ensure_ascii=False),
            created_at,
            created_at,
        ),
    ).lastrowid
    role_ids = {}
    for name, capacity, description, tags, accepting in [
        ("前端开发伙伴", 2, "使用 React / TypeScript 完成页面和移动端适配。", ["React", "TypeScript", "协作开发"], 1),
        ("后端开发伙伴", 2, "参与 FastAPI 接口、SQLite 数据维护与权限验证。", ["Python", "FastAPI", "SQLite"], 1),
        ("产品与用户研究伙伴", 1, "整理需求、设计访谈问题并绘制简单流程图。", ["用户研究", "产品设计", "零基础友好"], 1),
        ("视觉设计伙伴（暂停接收）", 1, "负责界面视觉规范和展示材料，当前暂停接收新申请。", ["UI 设计", "视觉表达"], 0),
    ]:
        role_ids[name] = db.execute(
            "INSERT INTO roles(post_id,name,capacity,description,tags,accepting) VALUES(?,?,?,?,?,?)",
            (post_id, name, capacity, description, json.dumps(tags, ensure_ascii=False), accepting),
        ).lastrowid

    for title, filename, content in [
        (
            "项目说明与活动安排",
            "TsingMate-项目说明.txt",
            "TsingMate 校园协作体验营（演示资料）\n"
            "目标：完成一个小型校园协作产品原型。\n"
            "阶段一：需求讨论与用户研究；阶段二：原型设计与实现；"
            "阶段三：成果展示与复盘。\n"
            "每周约 3–5 小时，周末讨论，平时异步协作。\n",
        ),
        (
            "参与前准备清单",
            "TsingMate-协作准备清单.txt",
            "参与前准备清单（演示资料）\n"
            "1. 选择感兴趣的岗位。\n2. 说明每周可投入时间。\n"
            "3. 简述相关经历；没有经历也可以申请。\n"
            "4. 作品链接可选，请勿上传敏感个人资料。\n",
        ),
    ]:
        attachment_id = db.execute(
            "INSERT INTO attachments(owner_id,post_id,filename,content_type,content,created_at) "
            "VALUES(?,?,?,?,?,?)",
            (owner_id, post_id, filename, "text/plain; charset=utf-8", content.encode("utf-8"), created_at),
        ).lastrowid
        extras["items"].append(
            {"title": title, "type": "attachment", "content": "", "attachment_id": attachment_id}
        )
    db.execute(
        "UPDATE posts SET extras=? WHERE id=?",
        (json.dumps(extras, ensure_ascii=False), post_id),
    )

    for email, role_name, status, message in [
        ("lin@example.test", "前端开发伙伴", "accepted", "【演示】熟悉 React，每周可投入 4 小时。"),
        ("chen@example.test", "后端开发伙伴", "pending", "【演示】会使用 Python，想参与接口开发。"),
        ("shen@example.test", "视觉设计伙伴（暂停接收）", "rejected", "【演示】曾申请视觉岗位，保留历史记录。"),
        ("shen@example.test", "前端开发伙伴", "withdrawn", "【演示】曾申请前端岗位，因时间冲突撤回。"),
    ]:
        user_id = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()["id"]
        application_id = db.execute(
            "INSERT INTO applications(post_id,role_id,user_id,status,message,experience,portfolio,reason,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                post_id, role_ids[role_name], user_id, status, message,
                "【演示经历】仅用于展示申请详情和私有资料。",
                "https://www.google.com/", "演示状态" if status == "rejected" else "",
                created_at, created_at,
            ),
        ).lastrowid
        db.execute(
            "INSERT INTO application_events(application_id,actor_id,status,reason,created_at) VALUES(?,?,?,?,?)",
            (application_id, owner_id if status in ("accepted", "rejected") else user_id, status, "演示状态", created_at),
        )


def seed():
    init_db()
    db = connect()
    try:
        db.execute("BEGIN IMMEDIATE")
        for name in CATEGORIES:
            db.execute("INSERT OR IGNORE INTO categories(name) VALUES(?)", (name,))
        if db.execute("SELECT 1 FROM users").fetchone():
            db.commit()
            print("已有用户，跳过演示账号与招募；分类已同步。")
            return
        password = os.getenv("SEED_PASSWORD", "CampusCrew-Dev-2026")
        for name, email, dept, tags in [
            ("林知夏", "lin@example.test", "计算机系", ["React", "用户研究", "徒步"]),
            (
                "陈书宁",
                "chen@example.test",
                "环境学院",
                ["Python", "产品设计", "可持续发展"],
            ),
            (
                "沈亦舟",
                "shen@example.test",
                "人文学院",
                ["OCR", "文献研究", "数字人文"],
            ),
            (
                "周映雪",
                "zhou@example.test",
                "美术学院",
                ["摄影", "UI 设计", "校园记录"],
            ),
        ]:
            db.execute(
                "INSERT INTO users(email,password_hash,name,dept,year,bio,tags,verified) VALUES(?,?,?,?,?,?,?,1)",
                (
                    email,
                    hash_password(password),
                    name,
                    dept,
                    "2024 级",
                    "希望用自己的专长，和不同学科的伙伴认真完成一个想法。",
                    json.dumps(tags, ensure_ascii=False),
                ),
            )
        for i, title in enumerate(TITLES):
            created_at = now()
            deadline = (
                datetime.now(timezone.utc) + timedelta(days=[1, 2, 6, 14, 5, 20][i])
            ).isoformat()
            category = [
                CATEGORIES[0],
                CATEGORIES[1],
                CATEGORIES[2],
                CATEGORIES[3],
                CATEGORIES[2],
                CATEGORIES[4],
            ][i]
            post_id = db.execute(
                "INSERT INTO posts(owner_id,title,category,description,tags,place,deadline,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (
                    [2, 1, 3, 4, 2, 1][i],
                    title,
                    category,
                    [
                        "我们想把校园里的低碳行动变成看得见的数据。\n从食堂、通勤和宿舍生活三个场景出发，进行访谈、数据整理与原型实现。\n\n你不需要是全能选手。我们希望每位伙伴都能负责一个明确的小方向，每周投入约 3–5 小时，共同完成调研与作品展示。",
                        "从真实需求出发，完成一个可以展示、可以使用的课程项目。",
                        "跨学科的小型研究与共创，欢迎带着好奇心加入。",
                    ][i % 3],
                    json.dumps(TAGS[i], ensure_ascii=False),
                    "线上协作" if i % 2 else "校内 / 紫荆",
                    deadline,
                    created_at,
                    created_at,
                ),
            ).lastrowid
            for name, capacity, tags in [
                ("前端开发", 2, ["React", "TypeScript"]),
                ("数据分析", 1, ["Python"]),
                ("视觉设计", 1, ["Figma"]),
            ]:
                db.execute(
                    "INSERT INTO roles(post_id,name,capacity,description,tags) VALUES(?,?,?,?,?)",
                    (
                        post_id,
                        name,
                        capacity,
                        "负责一个明确方向，共同完成项目。",
                        json.dumps(tags),
                    ),
                )
        seed_showcase(db)
        db.commit()
        print(
            "开发数据已创建。账号：lin / chen / shen / zhou @example.test。密码见 SEED_PASSWORD 或 README。"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
