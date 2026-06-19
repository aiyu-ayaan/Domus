from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.common.enums import DeviceType
from backend.common.models import Base, TimestampMixin, UUIDMixin


class Device(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "devices"
    __table_args__ = (
        # A device from an integration maps to exactly one external id.
        UniqueConstraint("integration_id", "external_id", name="uq_device_external"),
    )

    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id", ondelete="CASCADE"), index=True)
    integration_id: Mapped[UUID] = mapped_column(
        ForeignKey("integrations.id", ondelete="CASCADE"), index=True
    )
    room_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )

    # Adapter-side identifier used to address the physical device.
    external_id: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    device_type: Mapped[str] = mapped_column(String(32), default=DeviceType.other.value)
    online: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # "metadata" is reserved on the declarative base, so the attribute is `meta`
    # while the column keeps the spec's name.
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class DeviceState(UUIDMixin, Base):
    """Append-only state history. Latest row = current state."""

    __tablename__ = "device_states"

    device_id: Mapped[UUID] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True
    )
    state: Mapped[str] = mapped_column(String(32))
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
