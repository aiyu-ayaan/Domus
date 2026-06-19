# Domus

Domus is a self-hosted, local-first smart home platform for discovering, managing, automating, and controlling devices from a unified dashboard.

## Stack

- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Hook Form, Zod, Socket.IO client
- Backend: FastAPI, Python 3.12+, SQLAlchemy, Alembic, PostgreSQL, Redis, Pydantic v2, JWT auth, WebSockets, MQTT

## Layout

- `apps/web` - dashboard and operator UI
- `apps/api` - FastAPI backend and integration adapters
- `packages/shared-types` - shared TypeScript contracts
- `packages/shared-config` - shared configuration helpers
- `docker` - Dockerfiles and deployment support
- `docs` - architecture and usage docs
- `scripts` - local automation helpers

## Quick Start

1. Install Node.js, Python 3.12+, PostgreSQL, and Redis.
2. Install web dependencies with your preferred package manager.
3. Create a Python virtual environment in `apps/api` and install `pyproject.toml` dependencies.
4. Copy environment files as needed and start `web` and `api`.

## Architecture

Domus is organized as a modular monolith with clean boundaries:

- Presentation: Next.js app router UI
- Application: backend routers and services
- Domain: models, schemas, and shared contracts
- Infrastructure: database, Redis, MQTT, and device adapters

## Integrations

Mock adapters are scaffolded for Tapo, Xiaomi, Tuya, MQTT, Matter, and Zigbee.
