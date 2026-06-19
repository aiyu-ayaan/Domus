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
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 8000"]
