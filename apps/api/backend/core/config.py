import os
from functools import lru_cache
from urllib.parse import urlparse, urlunparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Domus API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # Database — async driver (psycopg3 speaks both async and sync).
    database_url: str = "postgresql+psycopg://domus:domus@localhost:5432/domus"
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str = "change-me"
    # Used to derive the Fernet key that encrypts integration credentials at rest.
    encryption_key: str = "change-me-too"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    cors_origins: list[str] = ["http://localhost:3000"]

    # Rate limiting (auth endpoints)
    auth_rate_limit: str = "10/minute"

    # MQTT
    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None

    @model_validator(mode="after")
    def adjust_urls_for_local_dev(self) -> "Settings":
        # Check if we are running inside a Docker container.
        is_docker = os.path.exists("/.dockerenv") or os.environ.get("IS_DOCKER") == "true" or os.path.exists("/run/.containerenv")
        if not is_docker:
            # If running locally on host, resolve container hostnames to 127.0.0.1
            try:
                parsed = urlparse(self.database_url)
                if parsed.hostname == "postgres":
                    netloc = parsed.netloc.replace("postgres", "127.0.0.1")
                    self.database_url = urlunparse(parsed._replace(netloc=netloc))
            except Exception:
                pass

            try:
                parsed = urlparse(self.redis_url)
                if parsed.hostname == "redis":
                    netloc = parsed.netloc.replace("redis", "127.0.0.1")
                    self.redis_url = urlunparse(parsed._replace(netloc=netloc))
            except Exception:
                pass
        return self

    @property
    def database_url_sync(self) -> str:
        """Alembic uses a sync engine; psycopg3 handles the same URL synchronously."""
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
