"""APScheduler 到期兜底扫描。

周期扫描 ``status='open' AND deadline_at <= now`` 的招募并惰性结束，
保证「无写操作时也能到期结束」（BR-08）。核心保证仍依赖各写路径的锁内复检。
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.utils import utcnow

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def scan_expired_recruitments() -> None:
    """扫描并结束所有已到期且仍为 open 的招募。"""
    # 延迟导入避免循环依赖
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models import Recruitment
    from app.services.recruitment_service import RecruitmentService

    with SessionLocal() as session:
        rows = session.execute(
            select(Recruitment.id).where(
                Recruitment.status == "open",
                Recruitment.deadline_at <= utcnow(),
            )
        ).scalars().all()
        ids = list(rows)

    for rid in ids:
        try:
            RecruitmentService().expire(rid)
        except Exception:  # noqa: BLE001 - 单条失败不影响其它扫描
            logger.exception("到期结束招募 %s 失败", rid)


def start_scheduler() -> None:
    """启动后台调度器（30s 间隔）。"""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        scan_expired_recruitments,
        trigger=IntervalTrigger(seconds=30),
        id="expire_scan",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("APScheduler 到期扫描已启动")


def shutdown_scheduler() -> None:
    """停止后台调度器。"""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
