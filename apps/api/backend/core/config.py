import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# ponytail: absolute path to the repo-root .env, not a ".env" relative to cwd — uvicorn's
# cwd differs depending on how it's launched (repo root vs apps/api), so a relative path
# was silently loading no file at all and falling back to the default ENCRYPTION_KEY,
# which made previously-encrypted integration secrets undecryptable.
_REPO_ROOT_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_REPO_ROOT_ENV), env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Domus API"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # --- Database connection ---
    # Set DATABASE_URL explicitly to override auto-construction from components.
    # Docker compose sets this via environment with the correct internal host.
    database_url: str | None = None

    # Individual components — change POSTGRES_PORT / POSTGRES_HOST etc. in .env
    # and database_url follows automatically (when not explicitly set).
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "domus"
    postgres_password: str = "domus"
    postgres_db: str = "domus"

    # --- Redis connection ---
    redis_url: str | None = None

    redis_host: str = "localhost"
    redis_port: int = 6379

    # Auth
    jwt_secret: str = "change-me"
    # Used to derive the Fernet key that encrypts integration credentials at rest.
    encryption_key: str = "change-me-too"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    cors_origins: list[str] = ["http://localhost:3000"]
    # Native apps (Capacitor Android/iOS/desktop) call the API from fixed local
    # origins, not http://host:port. Allow them by pattern so users don't have to
    # list every one. Matches capacitor://localhost, http(s)://localhost, etc.
    # electron-serve loads the app from "<scheme>://-" (literal dash host), so that
    # host form must be matched too or the Electron desktop app's CORS preflight fails.
    cors_origin_regex: str = r"^(https?|capacitor|ionic|capacitor-electron)://(localhost|-)?(:\d+)?$"

    # Rate limiting (auth endpoints)
    auth_rate_limit: str = "10/minute"

    # MQTT
    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str | None = None
    mqtt_password: str | None = None

    @model_validator(mode="after")
    def build_urls(self) -> "Settings":
        if self.database_url is None:
            self.database_url = (
                f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
            )
        if self.redis_url is None:
            self.redis_url = f"redis://{self.redis_host}:{self.redis_port}/0"
        return self

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
