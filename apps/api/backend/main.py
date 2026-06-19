from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from backend.api import api_router
from backend.core import redis as redis_mod
from backend.core.config import settings
from backend.core.exceptions import register_exception_handlers
from backend.core.logging import get_logger
from backend.core.ratelimit import limiter

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.automations.engine import register as register_automations

    log.info("Starting %s (%s)", settings.app_name, settings.environment)
    register_automations()  # subscribe the automation engine to the event bus
    if await redis_mod.ping():
        log.info("Redis connected")
    yield
    await redis_mod.close()
    log.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        openapi_url="/openapi.json",
        docs_url="/docs",
        lifespan=lifespan,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "domus-api"}

    @app.get("/health/ready", tags=["system"])
    async def ready() -> dict[str, object]:
        return {"status": "ok", **(await redis_mod.healthcheck())}

    return app


app = create_app()
