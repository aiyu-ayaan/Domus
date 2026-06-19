from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import User
from backend.common.enums import Role, role_rank
from backend.core import security
from backend.core.database import get_db
from backend.core.exceptions import ForbiddenError, UnauthorizedError

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing bearer token")
    try:
        payload = security.decode_token(credentials.credentials, security.ACCESS)
    except Exception as exc:  # noqa: BLE001
        raise UnauthorizedError("Invalid or expired token") from exc

    user = await session.get(User, UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise UnauthorizedError("User not found or disabled")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(minimum: Role):
    """Dependency factory enforcing ``user.role >= minimum``."""

    async def _checker(user: CurrentUser) -> User:
        if role_rank(user.role) < role_rank(minimum):
            raise ForbiddenError(f"Requires {minimum.value} role or higher")
        return user

    return _checker
