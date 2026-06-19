from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.dependencies import CurrentUser
from backend.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenPair,
    UserPublic,
)
from backend.auth.service import AuthService
from backend.core.config import settings
from backend.core.database import get_db
from backend.core.ratelimit import limiter

router = APIRouter(prefix="/auth", tags=["auth"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.auth_rate_limit)
async def register(request: Request, data: RegisterRequest, session: Session) -> RegisterResponse:
    user, tokens = await AuthService(session).register(data)
    return RegisterResponse(user=UserPublic.model_validate(user), tokens=tokens)


@router.post("/login", response_model=TokenPair)
@limiter.limit(settings.auth_rate_limit)
async def login(request: Request, data: LoginRequest, session: Session) -> TokenPair:
    service = AuthService(session)
    user = await service.authenticate(data.email, data.password)
    return await service.issue_tokens(user)


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(settings.auth_rate_limit)
async def refresh(request: Request, data: RefreshRequest, session: Session) -> TokenPair:
    return await AuthService(session).refresh(data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshRequest, session: Session) -> None:
    await AuthService(session).logout(data.refresh_token)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(data: ChangePasswordRequest, user: CurrentUser, session: Session) -> None:
    await AuthService(session).change_password(user, data.current_password, data.new_password)
