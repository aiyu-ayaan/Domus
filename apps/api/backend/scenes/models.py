from uuid import UUID

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.common.models import Base, TimestampMixin, UUIDMixin


class Scene(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "scenes"

    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    states: Mapped[list["SceneDeviceState"]] = relationship(
        back_populates="scene", cascade="all, delete-orphan", lazy="selectin"
    )


class SceneDeviceState(UUIDMixin, Base):
    """Desired state of one device when the scene activates."""

    __tablename__ = "scene_device_states"

    scene_id: Mapped[UUID] = mapped_column(ForeignKey("scenes.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[UUID] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    state: Mapped[str] = mapped_column(String(32))
    attributes: Mapped[dict] = mapped_column(JSON, default=dict)

    scene: Mapped[Scene] = relationship(back_populates="states")
