# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

This is a TypeScript/Python monorepo for Domus, a self-hosted smart home platform. The project uses Bun workspaces spanning frontend (Next.js) and backend (FastAPI) applications.

### Setup

1. Install Bun, Node.js, and Python 3.12+
2. Run `bun install` to set up all workspaces
3. For the API, create a Python virtual environment in `apps/api` and install with `pip install -e ".[dev]"`
4. PostgreSQL and Redis are required — use `docker-compose up postgres redis` for local development

### Common Commands

**Web (Frontend)**
- `bun run dev:web` — Start Next.js dev server on port 3000
- `bun --filter @domus/web build` — Build for production
- `bun --filter @domus/web lint` — Run ESLint

**API (Backend)**
- `bun run dev:api` — Start FastAPI dev server on port 8000 (requires Python venv)
- `bun --filter @domus/api test` — Run pytest tests
- `bun --filter @domus/api lint` — Run ruff and black checks
- `bun run format` — Format code with prettier (Node) and black (Python)

**Full Stack**
- `docker-compose up` — Spin up web, api, postgres, and redis
- `bun run build` — Build both web and api
- `bun run lint` — Lint all workspaces
- `bun run format` — Format code across all workspaces

## Architecture

Domus uses a modular monolith with clear separation of concerns:

- **`apps/web`** — Next.js 15 operator dashboard with React 19, Tailwind CSS, and shadcn/ui. Uses TanStack Query for server state, Zustand for UI state, and Socket.IO for real-time updates. App router pattern in `app/` directory with components in `components/`.

- **`apps/api`** — FastAPI backend with SQLAlchemy ORM, Alembic migrations, and async request handling. WebSocket support for real-time communication. Integration adapters for device control (Tapo, Xiaomi, Tuya, MQTT, Matter, Zigbee scaffolded).

- **`packages/shared-types`** — Zod schemas and TypeScript type definitions shared between web and api. Single source of truth for API contracts.

- **`packages/shared-config`** — Configuration constants shared across workspaces.

### Core Principles

1. **Device access always goes through integration adapters** — no direct device calls from the UI or outside the adapter layer.
2. **Web talks to API through typed contracts** — use shared-types Zod schemas for validation.
3. **Modular boundaries** — keep changes scoped to app/package boundaries. Changes should not require cross-app refactors.
4. **Typed, composable modules** — prefer small, focused, well-typed functions over large generic utilities.

## Database

PostgreSQL with SQLAlchemy ORM. Migrations use Alembic and live in `apps/api/backend/migrations/`.

To run a migration:
```bash
cd apps/api
alembic upgrade head
```

## Workspace Setup

All workspaces are listed in the root `package.json`. Each workspace can have independent scripts and dependencies. When adding a new workspace, update:
1. Root `package.json` workspaces array
2. Root `tsconfig.base.json` paths (for TypeScript references)

## Key Files

- `tsconfig.base.json` — Base TypeScript config with path aliases for all workspaces
- `.github/copilot-instructions.md` — Team guidance (preserve modular boundaries, device control through adapters, UI polish)
- `docker-compose.yml` — Local development stack (uses postgres:16-alpine, redis:7-alpine)
