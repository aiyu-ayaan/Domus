FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl && rm -rf /var/lib/apt/lists/*

COPY apps/api/pyproject.toml apps/api/README.md ./apps/api/
COPY apps/api/backend ./apps/api/backend
WORKDIR /app/apps/api
RUN pip install --upgrade pip && pip install -e .[dev]

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
