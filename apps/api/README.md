# Domus API

Self-hosted smart-home backend — FastAPI · SQLAlchemy 2.0 (async) · PostgreSQL · Redis ·
JWT · WebSockets · MQTT.

Discover, manage, automate, monitor and control devices from multiple ecosystems through
one typed, versioned API (`/api/v1`).

## Quick start

```bash
# 1. Databases (Postgres + Redis) via Docker — works nicely on Windows + WSL
docker compose -f ../../docker.dev.yml up -d

# 2. Python env
python -m venv .venv && . .venv/Scripts/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# 3. Config — defaults already point at the dev databases; override as needed
cp ../../.env.example .env

# 4. Migrate + run
alembic upgrade head
uvicorn backend.main:app --reload
```

Docs: http://localhost:8000/docs · Health: http://localhost:8000/health

Run the whole stack (web + api + db) instead: `docker compose up` from the repo root.

## Layout

```
backend/
  core/          config, async DB engine, Redis, JWT+bcrypt security, Fernet crypto,
                 event bus, error envelope, pagination, rate limiter, logging
  common/        DeclarativeBase + mixins, shared enums, generic CRUD repository
  auth/          register / login / refresh / logout / change-password, RBAC
  users/         profile (/users/me)
  homes/ rooms/  owner- and home-scoped CRUD
  devices/       CRUD + control (on/off/toggle) + append-only state history
  integrations/  Integration model + DeviceAdapter contract + registry + adapters/* + discovery
  automations/   trigger/conditions/actions engine (event-driven + manual)
  scenes/        device-state snapshots + activation
  notifications/ stored notifications
  websocket/     /ws connection manager + Redis cross-process bridge
  mqtt/          async MQTT service
  main.py        app factory + lifespan
```

## Security

- Passwords hashed with **bcrypt**; JWT **access + refresh** tokens, refresh tokens are
  stored server-side and **rotated/revoked** (logout and password change revoke them).
- **RBAC**: `owner > admin > user > guest`. The first registered user becomes `owner`;
  controlling a device requires at least `user` (guests are read-only).
- Integration credentials are encrypted at rest with **Fernet** (`ENCRYPTION_KEY`) and are
  never returned in API responses.
- Rate limiting on auth endpoints, CORS, Pydantic validation, consistent error envelope.

## Integrations & adapters

Every device belongs to an integration and is reached **only** through a `DeviceAdapter`
(`discover_devices`, `get_state`, `turn_on/off/toggle`). Six working mock adapters ship —
Tapo, Xiaomi, Tuya, MQTT, Matter, Zigbee — so discovery → control → history works without
hardware. Add a real one: implement the adapter, register it in `integrations/registry.py`.

`POST /integrations/{id}/discover` persists newly found devices and reports new vs
already-registered counts (deduped on `integration + external_id`).

## Automations

`IF (trigger + conditions) THEN (actions)`. Triggers: `device_state`, `device_offline`,
`new_device`, `time`, `manual`. Conditions: `field op value` (eq/ne/gt/lt/gte/lte/in),
AND-ed. Actions: `device.turn_on|off|toggle`, `scene.activate`, `notification.send`. The
engine subscribes to the event bus and also runs on demand via
`POST /automations/{id}/trigger`. Failures raise an `automation_failed` notification.

> Note: event-driven chaining relies on the engine opening its own DB session; this needs
> PostgreSQL. SQLite's single-writer lock blocks it in local smoke tests, so use the manual
> trigger (or Postgres) to exercise the event path locally.

## Real-time

`/ws?token=<access_token>` streams device-state changes, notifications and presence,
scoped to the homes a user owns. With multiple workers, the Redis bridge fans events out
across processes.

## Commands

```bash
uvicorn backend.main:app --reload     # dev server
alembic upgrade head                  # migrate
alembic revision --autogenerate -m "msg"   # new migration
pytest                                # tests
pytest --cov=backend --cov-report=term-missing
ruff check backend tests && black backend tests   # lint + format
```

## Configuration

All settings live in `backend/core/config.py` with safe defaults; override via env vars or
`.env` (see `../../.env.example`). Key ones: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `CORS_ORIGINS`, `AUTH_RATE_LIMIT`, `MQTT_ENABLED`.
