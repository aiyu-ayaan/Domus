"""add billing_settings to homes

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-27

Per-home money/tariff settings, stored server-side so web + Android share one source
of truth instead of each client keeping a local copy. Nullable; null = app defaults.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("homes", sa.Column("billing_settings", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("homes", "billing_settings")
