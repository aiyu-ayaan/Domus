"""Aggregate every feature router under the versioned prefix."""

from fastapi import APIRouter

from backend.auth.router import router as auth_router
from backend.automations.router import router as automations_router
from backend.core.config import settings
from backend.devices.router import router as devices_router
from backend.homes.router import router as homes_router
from backend.integrations.router import router as integrations_router
from backend.notifications.router import router as notifications_router
from backend.rooms.router import router as rooms_router
from backend.users.router import router as users_router

api_router = APIRouter(prefix=settings.api_v1_prefix)

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(homes_router)
api_router.include_router(rooms_router)
api_router.include_router(integrations_router)
api_router.include_router(devices_router)
api_router.include_router(automations_router)
api_router.include_router(notifications_router)
