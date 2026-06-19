from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.common.models import Base, TimestampMixin, UUIDMixin


class Automation(UUIDMixin, TimestampMixin, Base):
    """IF (trigger + conditions) THEN (actions).

    ponytail: trigger/conditions/actions are JSON columns validated by Pydantic schemas,
    not four normalized tables. A rule is always read and written as a whole; splitting it
    across tables buys joins and migrations for no query we actually run.
    """

    __tablename__ = "automations"

    home_id: Mapped[UUID] = mapped_column(ForeignKey("homes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    trigger: Mapped[dict] = mapped_column(JSON, default=dict)
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    actions: Mapped[list] = mapped_column(JSON, default=list)

    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
