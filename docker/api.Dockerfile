FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/pyproject.toml apps/api/README.md ./apps/api/
COPY apps/api/backend ./apps/api/backend
COPY apps/api/alembic ./apps/api/alembic
COPY apps/api/alembic.ini ./apps/api/alembic.ini
WORKDIR /app/apps/api
RUN pip install --upgrade pip && pip install .

EXPOSE 8000
# Apply migrations, then serve. DATABASE_URL/REDIS_URL/JWT_SECRET come from the environment.
# Bind 8000 by default so bridge's "<host>:8000" port mapping works. Don't key this off
# API_PORT — that's the *host* published port (in .env, injected via env_file) and would
# otherwise move the in-container bind. The host-networking overlay sets UVICORN_PORT
# instead, so uvicorn binds the published port directly on the host.
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port ${UVICORN_PORT:-8000} --log-level ${UVICORN_LOG_LEVEL:-warning} --timeout-keep-alive 30"]
