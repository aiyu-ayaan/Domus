"""Redis access: cache, pub/sub event bridge, and a simple queue.

The client is lazily created and degrades gracefully — if Redis is unreachable the app
still serves requests (cache misses, no cross-process fan-out). ponytail: don't crash the
whole API because a cache is down.
"""

from typing import Any

import redis.asyncio as aioredis

from backend.core.config import settings
from backend.core.logging import get_logger

log = get_logger("redis")

_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def ping() -> bool:
    try:
        return await get_redis().ping()
    except Exception:  # noqa: BLE001
        log.warning("redis ping failed (%s)", settings.redis_url)
        return False


async def cache_get(key: str) -> str | None:
    try:
        return await get_redis().get(key)
    except Exception:  # noqa: BLE001
        return None


async def cache_set(key: str, value: str, ttl: int = 60) -> None:
    try:
        await get_redis().set(key, value, ex=ttl)
    except Exception:  # noqa: BLE001
        pass


async def publish(channel: str, message: str) -> None:
    try:
        await get_redis().publish(channel, message)
    except Exception:  # noqa: BLE001
        pass


async def enqueue(queue: str, value: str) -> None:
    try:
        await get_redis().rpush(queue, value)
    except Exception:  # noqa: BLE001
        pass


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def healthcheck() -> dict[str, Any]:
    return {"redis": "ok" if await ping() else "unreachable"}
