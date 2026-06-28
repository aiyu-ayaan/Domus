"""Centralized LAN device discovery primitives.

UDP broadcast — how Tapo and Tuya normally find devices — can't cross a Docker
bridge network, so discovery comes up empty inside a container. The fix is the
same for every local integration: unicast/TCP-probe the hosts in
``DISCOVERY_SUBNETS`` (which a bridge container *can* route to the LAN) instead
of relying on broadcast. This module owns that one implementation so the
adapters share it rather than each re-deriving it.
"""

from __future__ import annotations

import asyncio
import ipaddress
from collections.abc import Awaitable, Callable


def discovery_subnets() -> list[str]:
    """CIDRs to unicast-sweep, from ``DISCOVERY_SUBNETS`` in the env.

    Comma-separated, e.g. ``"192.168.1.0/24"``. Empty = broadcast only (which
    needs the API on the LAN: run locally or with Docker host networking).
    Lazy import keeps this module settings-light.
    """
    from backend.core.config import settings

    return [s.strip() for s in settings.discovery_subnets.split(",") if s.strip()]


def expand_targets(entries: list[str]) -> list[str]:
    """Expand CIDR entries to host IPs; pass plain IPs/hostnames through.

    A CIDR ("192.168.1.0/24") becomes every host IP in it — turning discovery
    into a unicast sweep, the only thing that reaches LAN devices from inside a
    Docker bridge container (broadcast is silently dropped there). A junk
    "CIDR" falls back to being treated as a literal host.
    """
    targets: list[str] = []
    for raw in entries:
        entry = raw.strip()
        if not entry:
            continue
        if "/" in entry:
            try:
                net = ipaddress.ip_network(entry, strict=False)
                targets.extend(str(ip) for ip in net.hosts())
                continue
            except ValueError:
                pass  # not a CIDR — treat as a literal host
        targets.append(entry)
    return targets


async def sweep[T](
    probe: Callable[[str], Awaitable[T | None]],
    targets: list[str],
    *,
    concurrency: int = 256,
) -> dict[str, T]:
    """Run ``probe`` against every target concurrently; keep only truthy answers.

    Best-effort by design: unreachable IPs in a swept subnet are the common
    case, so per-host failures/empties are dropped rather than raised. The
    semaphore caps in-flight probes so a wide sweep (a whole /24) finishes in
    roughly one timeout window without opening thousands of sockets at once.
    """
    if not targets:
        return {}
    sem = asyncio.Semaphore(concurrency)

    async def _run(host: str) -> tuple[str, T | None]:
        async with sem:
            try:
                return host, await probe(host)
            except Exception:
                return host, None

    results = await asyncio.gather(*(_run(host) for host in targets))
    return {host: res for host, res in results if res}
