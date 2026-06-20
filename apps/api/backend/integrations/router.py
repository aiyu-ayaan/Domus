from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.core.database import get_db
from backend.integrations.registry import available_integrations
from backend.integrations.schemas import (
    DiscoveryResult,
    IntegrationCreate,
    IntegrationOut,
    IntegrationUpdate,
)
from backend.integrations.service import IntegrationService

router = APIRouter(prefix="/integrations", tags=["integrations"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("/available", response_model=list[str])
async def list_available(_: CurrentUser) -> list[str]:
    return available_integrations()


@router.get("/tuya/scan", response_model=list[dict])
async def scan_tuya_lan(_: CurrentUser) -> list[dict]:
    """Broadcast-scan the LAN for Tuya devices (id/ip/version, no local_key).

    Mirrors Home Assistant's ``localtuya`` scan step: this only finds devices and
    their basic identity, never a usable key — the local_key still has to come
    from the Tuya IoT Platform (see tuya_local.py docstring).
    """
    import asyncio

    import tinytuya

    found = await asyncio.to_thread(
        tinytuya.deviceScan, False, 6, False, False, False
    )
    return [
        {
            "id": info.get("gwId") or info.get("id"),
            "ip": ip,
            "version": str(info.get("version") or "3.3"),
        }
        for ip, info in found.items()
    ]


@router.get("", response_model=list[IntegrationOut])
async def list_integrations(
    user: CurrentUser, session: Session, home_id: UUID | None = None
) -> list[IntegrationOut]:
    items = await IntegrationService(session).list_for(user, home_id)
    return [IntegrationOut.model_validate(i) for i in items]


@router.post("", response_model=IntegrationOut, status_code=status.HTTP_201_CREATED)
async def create_integration(
    data: IntegrationCreate, user: CurrentUser, session: Session
) -> IntegrationOut:
    return IntegrationOut.model_validate(await IntegrationService(session).create(data, user))


@router.get("/{integration_id}", response_model=IntegrationOut)
async def get_integration(
    integration_id: UUID, user: CurrentUser, session: Session
) -> IntegrationOut:
    return IntegrationOut.model_validate(
        await IntegrationService(session).get_for(integration_id, user)
    )


@router.patch("/{integration_id}", response_model=IntegrationOut)
async def update_integration(
    integration_id: UUID, data: IntegrationUpdate, user: CurrentUser, session: Session
) -> IntegrationOut:
    return IntegrationOut.model_validate(
        await IntegrationService(session).update(integration_id, data, user)
    )


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration(integration_id: UUID, user: CurrentUser, session: Session) -> None:
    await IntegrationService(session).delete(integration_id, user)


@router.post("/{integration_id}/discover", response_model=DiscoveryResult)
async def discover(integration_id: UUID, user: CurrentUser, session: Session) -> DiscoveryResult:
    return await IntegrationService(session).discover(integration_id, user)
