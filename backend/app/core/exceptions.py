"""业务异常、错误码表与全局异常处理器。

统一响应体约定：``{"code": 0, "message": "ok", "data": {}}``。
只有未登录/登录态失效（40100/40101）返回 HTTP 401，其余业务错误一律
HTTP 200 + 非零 code，以便前端 axios 拦截器区分「未登录」与「业务冲突」。
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ErrorCode:
    """MVP 精简错误码表（与 mvp_spec.md §4.2 对齐）。"""

    SUCCESS = 0
    INVALID_PARAM = 40000
    UNAUTHORIZED = 40100
    TOKEN_EXPIRED = 40101
    FORBIDDEN = 40300
    NOT_VERIFIED = 40301
    NOT_FOUND = 40400
    CONFLICT = 40900
    POSITION_FULL = 40901
    RECRUITMENT_CLOSED = 40902
    HAS_HISTORY = 40903
    SELF_APPLY = 40904
    SERVER_ERROR = 50000


class BizError(Exception):
    """业务异常。

    Attributes:
        code: 业务错误码（见 ErrorCode）。
        message: 面向用户的错误提示。
        http_status: HTTP 状态码，默认 200（仅鉴权类错误使用 401）。
    """

    def __init__(self, code: int, message: str, http_status: int = 200) -> None:
        self.code = code
        self.message = message
        self.http_status = http_status
        super().__init__(message)


def ok(data=None, message: str = "ok") -> dict:
    """构造成功响应体。"""
    return {"code": 0, "message": message, "data": data}


def _error_body(code: int, message: str) -> dict:
    return {"code": code, "message": message, "data": None}


def register_exception_handlers(app: FastAPI) -> None:
    """注册全局异常处理器，保证所有异常都返回统一响应体。"""

    @app.exception_handler(BizError)
    async def biz_error_handler(_: Request, exc: BizError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content=_error_body(exc.code, exc.message),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # 保留第一条校验错误详情，便于调试与前端提示
        detail = "参数校验失败"
        if exc.errors():
            first = exc.errors()[0]
            loc = ".".join(str(x) for x in first.get("loc", []))
            msg = first.get("msg", "")
            detail = f"参数校验失败：{loc} {msg}"
        return JSONResponse(
            status_code=200,
            content=_error_body(ErrorCode.INVALID_PARAM, detail),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=200,
            content=_error_body(ErrorCode.SERVER_ERROR, "服务器内部错误"),
        )
