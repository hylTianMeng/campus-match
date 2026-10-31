"""应用配置中心。

基于 pydantic-settings，支持从环境变量或 .env 文件加载配置。
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """全局配置。

    字段名与环境变量名一一对应（大小写不敏感）。
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "CampusCrew"
    debug: bool = False
    enable_scheduler: bool = True

    database_url: str = (
        "mysql+pymysql://root:password@localhost:3306/campus_crew?charset=utf8mb4"
    )

    jwt_secret_key: str = "please-change-me-to-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # 校园邮箱域名白名单（逗号分隔，比较时统一小写）
    allowed_email_domains: str = "@stu.example.edu"
    cors_origins: str = "http://localhost:5173"

    @property
    def allowed_email_domain_list(self) -> list[str]:
        """返回小写化的域名白名单列表。"""
        return [
            d.strip().lower()
            for d in self.allowed_email_domains.split(",")
            if d.strip()
        ]

    @property
    def cors_origin_list(self) -> list[str]:
        """返回 CORS 允许来源列表。"""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """获取缓存后的全局配置单例。"""
    return Settings()


settings = get_settings()
