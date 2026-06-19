from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared limiter so routers can decorate endpoints without importing main (circular).
limiter = Limiter(key_func=get_remote_address, default_limits=[])
