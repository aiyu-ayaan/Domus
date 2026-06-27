from uuid import UUID

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.common.models import Base, TimestampMixin, UUIDMixin


class Home(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "homes"

    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Money/tariff settings (currency, flat or tiered rate, billing cycle). Synced to all
    # clients via the home API so web + Android share one source of truth instead of each
    # keeping its own local copy. Null = app defaults.
    billing_settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
