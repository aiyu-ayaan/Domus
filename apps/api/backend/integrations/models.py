from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.common.models import Base, TimestampMixin, UUIDMixin


class Integration(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "integrations"

    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(32), index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Credentials are stored Fernet-encrypted (never plaintext at rest).
    config_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
