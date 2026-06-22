import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

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
    import asyncio
    import sys

    from backend.automations.engine import register as register_automations
    from backend.devices.poller import poll_devices_loop
    from backend.mqtt.service import mqtt_service
    from backend.websocket import manager as ws_manager
    from backend.websocket import redis_bridge

    log.info("Starting %s (%s)", settings.app_name, settings.environment)
    register_automations()  # automation engine subscribes to the event bus
    ws_manager.register()  # websocket manager subscribes to the event bus
    await redis_bridge.start()  # cross-process fan-out (best-effort)
    if await redis_mod.ping():
        log.info("Redis connected")
    if settings.mqtt_enabled:
        await mqtt_service.start()
        log.info("MQTT service started")

    poller_task = None
    if "pytest" not in sys.modules:
        poller_task = asyncio.create_task(poll_devices_loop())

    yield

    if poller_task:
        poller_task.cancel()
        try:
            await poller_task
        except asyncio.CancelledError:
            pass

    await mqtt_service.stop()
    await redis_bridge.stop()
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
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)

    from backend.websocket.router import router as ws_router

    app.include_router(ws_router)  # /ws (real-time updates, notifications, presence)

    import os
    from fastapi.staticfiles import StaticFiles
    
    static_dir = os.path.join(os.getcwd(), "static")
    os.makedirs(os.path.join(static_dir, "avatars"), exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "domus-api"}

    @app.get("/health/ready", tags=["system"])
    async def ready() -> dict[str, object]:
        return {"status": "ok", **(await redis_mod.healthcheck())}

    return app


app = create_app()
