from fastapi import APIRouter

from backend.api.routers import auth, automations, dashboard, devices, integrations, realtime, rooms, scenes

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(scenes.router, prefix="/scenes", tags=["scenes"])
api_router.include_router(automations.router, prefix="/automations", tags=["automations"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(realtime.router, tags=["realtime"])
