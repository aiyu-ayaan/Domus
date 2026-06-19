FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# Install build dependencies and curl
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors to cache package installation
COPY apps/api/pyproject.toml apps/api/README.md ./apps/api/
COPY apps/api/alembic ./apps/api/alembic
COPY apps/api/alembic.ini ./apps/api/alembic.ini

WORKDIR /app/apps/api
RUN pip install --upgrade pip && pip install -e ".[dev]"

EXPOSE 8000

# Run migrations and serve with reload enabled
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"]
