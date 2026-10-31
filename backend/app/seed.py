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
                "INSERT INTO posts(owner_id,title,category,description,tags,place,deadline,created_at) VALUES(?,?,?,?,?,?,?,?)",
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
                    now(),
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
