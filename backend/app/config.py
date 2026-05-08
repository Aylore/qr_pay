from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/qrpay"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    encryption_key: str = "dev-encryption-key-32-bytes-here"

    app_base_url: str = "http://localhost:8000"
    diner_base_url: str = "http://localhost:5173"
    mock_gateway_base_url: str = "http://localhost:8000/mock-gateway"
    mock_gateway_secret: str = "mock-gateway-webhook-secret"
    foodics_webhook_secret: str = "foodics-webhook-secret"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
