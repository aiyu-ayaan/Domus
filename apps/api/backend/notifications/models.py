from uuid import UUID

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.common.enums import NotificationType
from backend.common.models import Base, TimestampMixin, UUIDMixin


class Notification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32), default=NotificationType.security_alert.value)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
