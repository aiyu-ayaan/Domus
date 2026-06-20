"""Import every model module so ``Base.metadata`` is fully populated.

Alembic autogenerate and ``create_all`` both rely on this single import.
Each new feature module adds its import here.
"""

from backend.auth import models as auth_models  # noqa: F401
from backend.automations import models as automation_models  # noqa: F401
from backend.devices import models as device_models  # noqa: F401
from backend.homes import models as home_models  # noqa: F401
from backend.integrations import models as integration_models  # noqa: F401
from backend.notifications import models as notification_models  # noqa: F401
from backend.rooms import models as room_models  # noqa: F401

__all__ = [
    "auth_models",
    "home_models",
    "room_models",
    "integration_models",
    "device_models",
    "automation_models",
    "notification_models",
]
