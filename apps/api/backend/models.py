"""Import every model module so ``Base.metadata`` is fully populated.

Alembic autogenerate and ``create_all`` both rely on this single import.
Each new feature module adds its import here.
"""

from backend.auth import models as auth_models  # noqa: F401

__all__ = ["auth_models"]
