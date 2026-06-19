from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db.session import Base


class Role(str, Enum):
    admin = "admin"
    member = "member"
    viewer = "viewer"


class IntegrationKind(str, Enum):
    tapo = "tapo"
    xiaomi = "xiaomi"
    tuya = "tuya"
    mqtt = "mqtt"
    matter = "matter"
    zigbee = "zigbee"
    shelly = "shelly"
    sonoff = "sonoff"
    custom = "custom"


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default=Role.member.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Home(Base):
    __tablename__ = "homes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    owner: Mapped[User] = relationship()


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    name: Mapped[str] = mapped_column(String(255), index=True)
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Integration(Base):
    __tablename__ = "integrations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    kind: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    room_id: Mapped[UUID | None] = mapped_column(ForeignKey("rooms.id"), nullable=True)
    integration_id: Mapped[UUID] = mapped_column(ForeignKey("integrations.id"))
    name: Mapped[str] = mapped_column(String(255), index=True)
    device_type: Mapped[str] = mapped_column(String(64), default="light")
    vendor: Mapped[str] = mapped_column(String(64), default="unknown")
    online: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)


class DeviceState(Base):
    __tablename__ = "device_states"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    device_id: Mapped[UUID] = mapped_column(ForeignKey("devices.id"), index=True)
    state: Mapped[dict] = mapped_column(JSON, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    definition: Mapped[dict] = mapped_column(JSON, default=dict)


class Automation(Base):
    __tablename__ = "automations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    name: Mapped[str] = mapped_column(String(255))
    trigger: Mapped[dict] = mapped_column(JSON, default=dict)
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)
    actions: Mapped[dict] = mapped_column(JSON, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(128), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id"))
    user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
