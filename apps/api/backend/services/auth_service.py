from sqlalchemy.orm import Session

from backend.core.security import create_token, hash_password, verify_password
from backend.models.domain import User


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def register_user(self, email: str, password: str) -> User:
        user = User(email=email, password_hash=hash_password(password))
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def authenticate(self, email: str, password: str) -> tuple[str, str] | None:
        user = self.db.query(User).filter(User.email == email).one_or_none()
        if user is None or not verify_password(password, user.password_hash):
            return None
        return create_token(str(user.id), 30), create_token(str(user.id), 60 * 24 * 30)
