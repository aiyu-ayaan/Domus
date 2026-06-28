"""add composite index on device_states(device_id, created_at)

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-28

The energy summary query filters device_states by device_id IN (...) and
created_at >= origin. The poller's _last_state lookup also filters by
device_id ordered by created_at DESC. Without a composite index Postgres
must scan all rows matching either single-column index and then re-check
the other condition. With (device_id, created_at) both paths use one index.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_device_states_device_id_created_at",
        "device_states",
        ["device_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_device_states_device_id_created_at", table_name="device_states")
