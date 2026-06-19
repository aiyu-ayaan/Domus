"""Aggregate every feature router under the versioned prefix."""

from fastapi import APIRouter

from backend.auth.router import router as auth_router
from backend.core.config import settings
from backend.users.router import router as users_router

api_router = APIRouter(prefix=settings.api_v1_prefix)

api_router.include_router(auth_router)
api_router.include_router(users_router)
