from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TariffTier(BaseModel):
    """One slab of a tiered tariff. ``up_to`` null = unbounded top slab."""

    up_to: float | None = None
    rate: float = 0.0


class BillingSettings(BaseModel):
    """Per-home money settings, synced across web + Android.

    Mirrors the tariff the electricity page edits. Cost is computed client-side from
    this; the API only stores it so every device sees the same currency + rates.
    """

    type: Literal["flat", "tiered"] = "flat"
    currency: str = Field(default="₹", max_length=8)
    rate: float = 8.0  # flat price per kWh
    fixed_charge: float = 0.0
    tiers: list[TariffTier] = Field(default_factory=list)
    billing_cycle_start_day: int = Field(default=1, ge=1, le=31)


class HomeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    timezone: str = Field(default="UTC", max_length=64)


class HomeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    timezone: str | None = Field(default=None, max_length=64)
    billing_settings: BillingSettings | None = None


class HomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    timezone: str
    owner_id: UUID
    created_at: datetime
    billing_settings: BillingSettings

    @field_validator("billing_settings", mode="before")
    @classmethod
    def _default_billing(cls, v: object) -> object:
        # Stored column is null until the user saves settings — fall back to defaults
        # so clients always receive a complete, ready-to-use config.
        return v or BillingSettings()
