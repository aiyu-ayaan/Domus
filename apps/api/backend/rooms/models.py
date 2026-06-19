from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.common.models import Base, TimestampMixin, UUIDMixin


class Room(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "rooms"

    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
