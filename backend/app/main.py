import asyncio
import os
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .db import init_db, connect, expire_posts
from .routers import auth, recruitment, community


def sweep():
    db = connect()
    try:
        db.execute("BEGIN IMMEDIATE")
        expire_posts(db)
        db.commit()
    finally:
        db.close()


async def deadline_worker():
    while True:
        await asyncio.sleep(30)
        await asyncio.to_thread(sweep)


@asynccontextmanager
async def lifespan(app):
    init_db()
    sweep()
    task = asyncio.create_task(deadline_worker())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


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
        if request.method in (
            "POST",
            "PUT",
            "PATCH",
        ) and "application/json" not in request.headers.get("content-type", ""):
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
