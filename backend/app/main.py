# Load ``.env`` before any application module reads environment variables
# (db.py / emailing.py read DATABASE_PATH / SMTP_* at import time).
from dotenv import load_dotenv

load_dotenv()

import asyncio
import os
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .db import init_db, connect, expire_posts, sweep_group_chats, WRITE_LOCK
from .routers import auth, recruitment, community, account, admin, governance
from .routers import groupchat as groupchat_router


def sweep():
    db = connect()
    try:
        with WRITE_LOCK:
            db.execute("BEGIN IMMEDIATE")
            expire_posts(db)
            sweep_group_chats(db)
            db.commit()
    finally:
        db.close()


def _deadline_loop(stop_event: threading.Event) -> None:
    """Sweep expired recruitments every 30s until ``stop_event`` is set."""
    while not stop_event.wait(30):
        sweep()


@asynccontextmanager
async def lifespan(app):
    init_db()
    sweep()
    stop_event = threading.Event()
    worker = threading.Thread(
        target=_deadline_loop,
        args=(stop_event,),
        name="deadline-worker",
        daemon=True,
    )
    worker.start()
    yield
    stop_event.set()
    # Join the worker off the event loop and wait for any in-flight sweep() to
    # finish, instead of leaking the thread after cancellation.
    await asyncio.to_thread(worker.join)


app = FastAPI(title="CampusCrew API", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def same_origin_writes(request: Request, call_next):
    # JSON-only browser API + explicit Origin checks protect cookie authenticated writes.
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        allowed = os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
        ).split(",")
        origin = request.headers.get("origin")
        if origin and origin not in allowed:
            return JSONResponse({"detail": "请求来源不受信任"}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "不允许跨站写入"}, status_code=403)
        if request.method in ("POST", "PUT", "PATCH"):
            content_type = request.headers.get("content-type", "")
            # Allow multipart only for the avatar upload endpoint; JSON is still
            # strictly required for every other write.
            if "application/json" not in content_type and not content_type.startswith(
                "multipart/form-data"
            ):
                return JSONResponse({"detail": "请使用 JSON 请求"}, status_code=415)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(recruitment.router)
app.include_router(community.router)
app.include_router(groupchat_router.router)
app.include_router(account.router)
app.include_router(admin.router)

app.include_router(governance.router)
