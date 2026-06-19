from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.models import RefreshToken, User
from backend.auth.schemas import RegisterRequest, TokenPair
from backend.common.enums import Role
from backend.core import security
from backend.core.exceptions import ConflictError, UnauthorizedError
from backend.core.security import decode_token


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _by_email(self, email: str) -> User | None:
        res = await self.session.execute(select(User).where(User.email == email.lower()))
        return res.scalar_one_or_none()

    async def register(self, data: RegisterRequest) -> tuple[User, TokenPair]:
        if await self._by_email(data.email):
            raise ConflictError("Email already registered")
        # First user to register owns the instance; everyone else is a regular user.
        is_first = (await self.session.execute(select(User.id).limit(1))).first() is None
        user = User(
            email=data.email.lower(),
            password_hash=security.hash_password(data.password),
            full_name=data.full_name,
            role=(Role.owner if is_first else Role.user).value,
        )
        self.session.add(user)
        await self.session.flush()
        tokens = await self.issue_tokens(user)
        return user, tokens

    async def authenticate(self, email: str, password: str) -> User:
        user = await self._by_email(email)
        if not user or not security.verify_password(password, user.password_hash):
            raise UnauthorizedError("Invalid email or password")
        if not user.is_active:
            raise UnauthorizedError("Account is disabled")
        return user

    async def issue_tokens(self, user: User) -> TokenPair:
        access = security.create_access_token(str(user.id), role=user.role)
        refresh, jti = security.create_refresh_token(str(user.id))
        expires = datetime.fromtimestamp(decode_token(refresh, security.REFRESH)["exp"], tz=UTC)
        self.session.add(RefreshToken(user_id=user.id, jti=jti, expires_at=expires))
        await self.session.flush()
        return TokenPair(access_token=access, refresh_token=refresh)

    async def refresh(self, refresh_token: str) -> TokenPair:
        try:
            payload = decode_token(refresh_token, security.REFRESH)
        except Exception as exc:  # noqa: BLE001
            raise UnauthorizedError("Invalid refresh token") from exc

        res = await self.session.execute(
            select(RefreshToken).where(RefreshToken.jti == payload["jti"])
        )
        stored = res.scalar_one_or_none()
        if not stored or stored.revoked:
            raise UnauthorizedError("Refresh token revoked or unknown")

        stored.revoked = True  # rotation: old token can't be reused
        user = await self.session.get(User, stored.user_id)
        if not user or not user.is_active:
            raise UnauthorizedError("Account is disabled")
        return await self.issue_tokens(user)

    async def logout(self, refresh_token: str) -> None:
        try:
            payload = decode_token(refresh_token, security.REFRESH)
        except Exception:  # noqa: BLE001
            return  # already invalid — nothing to revoke
        res = await self.session.execute(
            select(RefreshToken).where(RefreshToken.jti == payload["jti"])
        )
        stored = res.scalar_one_or_none()
        if stored:
            stored.revoked = True

    async def change_password(self, user: User, current: str, new: str) -> None:
        if not security.verify_password(current, user.password_hash):
            raise UnauthorizedError("Current password is incorrect")
        user.password_hash = security.hash_password(new)
        # Revoke every refresh token on password change.
        res = await self.session.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)
            )
        )
        for token in res.scalars():
            token.revoked = True
