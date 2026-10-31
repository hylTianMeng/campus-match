"""FastAPI 应用入口。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers, ok
from app.tasks.scheduler import shutdown_scheduler, start_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.enable_scheduler:
        start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health():
    """健康检查。"""
    return ok({"status": "ok"})
