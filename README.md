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

1. Install Bun, Node.js, Python 3.12+, PostgreSQL, and Redis.
2. Run `bun install` to set up all workspaces.
3. For the API, create a Python virtual environment in `apps/api` and install with `pip install -e ".[dev]"`.
4. PostgreSQL and Redis are required — use `docker-compose up postgres redis` for local development.
5. Copy environment files as needed and start `web` and `api`.

## Commands
### To Activate Python Virtual Environment
```
& apps/api/.venv/Scripts/Activate.ps1
```

### Web (Frontend)
- `bun run dev:web` — Start Next.js dev server on port 3000
- `bun --filter @domus/web build` — Build for production
- `bun --filter @domus/web lint` — Run ESLint

### API (Backend)
- `bun run dev:api` — Start FastAPI dev server on port 8000 (requires Python venv)
- `bun --filter @domus/api test` — Run pytest tests
- `bun --filter @domus/api lint` — Run ruff and black checks

### Full Stack
- `docker-compose up` — Spin up web, api, postgres, and redis
- `bun run build` — Build both web and api
- `bun run lint` — Lint all workspaces
- `bun run format` — Format code with prettier (Node) and black (Python)

## Architecture

Domus is organized as a modular monolith with clean boundaries:

- Presentation: Next.js app router UI
- Application: backend routers and services
- Domain: models, schemas, and shared contracts
- Infrastructure: database, Redis, MQTT, and device adapters

## Integrations

Mock adapters are scaffolded for Tapo, Xiaomi, Tuya, MQTT, Matter, and Zigbee.
