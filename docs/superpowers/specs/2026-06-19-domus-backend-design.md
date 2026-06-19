# Domus Backend — Design

Date: 2026-06-19
Status: Approved (build in phases, commit per phase)

## Goal

A local-first smart-home backend (Home Assistant-inspired): discover, manage,
automate, monitor and control devices across ecosystems through one typed API.

## Stack

Python 3.12 · FastAPI · SQLAlchemy 2.0 (async, `postgresql+psycopg`) · Alembic ·
PostgreSQL · Redis · Pydantic v2 · JWT · WebSockets · MQTT (`aiomqtt`) ·
pytest · ruff · black.

## Layout (modular monolith, clean-ish layers)

Modules live directly under `apps/api/backend/<module>/` (the `backend` package
_is_ the source root — the spec's `src/` wrapper is dropped as redundant).

```
backend/
  core/         config, database, redis, security, deps, exceptions, pagination, logging, events
  common/       Base model + mixins, shared enums, generic CRUD repository
  auth/         User + RefreshToken models, JWT issue/verify, RBAC, register/login/refresh/logout/change-password
  users/        profile get/update/delete, avatar
  homes/        Home CRUD (owner-scoped)
  rooms/        Room CRUD (home-scoped)
  devices/      Device CRUD + control (on/off/toggle) + DeviceState history
  integrations/ Integration model + DeviceAdapter base + registry + adapters/* (tapo,xiaomi,tuya,mqtt,matter,zigbee mocks) + discovery
  automations/  Automation model (trigger/conditions/actions JSON) + evaluation/execution engine
  scenes/       Scene + device-state snapshot + activate
  notifications/ Notification store + list
  websocket/    connection manager + /ws (state updates, notifications, presence)
  mqtt/         async MQTT service (subscribe/publish/reconnect/topic routing)
  main.py       app factory, router mount (/api/v1), lifespan (db/redis/mqtt/ws)
```

## Cross-cutting decisions

- **DI**: FastAPI `Depends`, not the `dependency-injector` lib. Services take an
  `AsyncSession`. One generic `CRUDRepository[Model]` in `common/`, not per-model classes.
- **IDs**: UUID PKs everywhere. `TimestampMixin` for `created_at`/`updated_at`.
- **RBAC**: roles `owner > admin > user > guest`. `require_role(min_role)` dependency.
- **Multi-tenancy**: all domain rows hang off a `home`; access checked via home membership/ownership.
- **API**: versioned under `/api/v1`, consistent error envelope, cursor/offset pagination
  helper, filtering/sorting on list endpoints where it matters.
- **Events**: in-process event bus that fans out to (a) WebSocket clients and (b) Redis
  pub/sub (for horizontal scaling). Device state changes + notifications publish events.
- **Control flow**: UI/API → device service → integration adapter (never direct device calls).
- **Security**: bcrypt password hashing, JWT access+refresh, refresh-token rotation/revocation
  in DB, CORS, slowapi rate limiting on auth, Pydantic validation, audit log on mutations.

## Adapters

`DeviceAdapter` ABC: `discover_devices`, `get_devices`, `get_state`, `turn_on`,
`turn_off`, `toggle`. Six mock adapters return deterministic fake devices/state so the
whole control + discovery + state-history path is exercisable without hardware.
`registry.py` maps integration `kind` → adapter class; `get_adapter(integration)` builds one.

## Automation engine

Trigger types: `device_state`, `device_offline`, `time`/`sunset` (cron-ish), `manual`.
Conditions: simple `field op value` list (AND). Actions: `device.turn_on/off/toggle`,
`scene.activate`, `notification.send`. Engine subscribes to the event bus; on a matching
trigger it evaluates conditions then runs actions, recording success/failure as a
notification on error.

## Testing (meaningful, not coverage-chasing)

pytest + httpx ASGI transport, SQLite-in-memory (aiosqlite) for fast DB tests.
Cover: register/login/refresh, RBAC denial, device on/off/toggle through mock adapter,
state history append, discovery dedupe (new vs already-registered), automation
condition evaluation, scene activate. CI runs ruff + black --check + pytest.

## Phasing (one commit each)

1. Foundation: core + common + auth + users, import-clean, alembic env.
2. homes + rooms + devices (CRUD, control, state history) + integration model.
3. Integration framework: base/registry/6 mock adapters/discovery; wire control through adapters.
4. automations engine + scenes + notifications.
5. mqtt service + websocket manager + redis event bus.
6. tests + CI + Dockerfile + docker-compose + docker.dev.yml + README.

## Deliberately skipped (YAGNI, add when needed)

- `dependency-injector` (FastAPI Depends covers it).
- Per-model repository classes (one generic CRUD repo).
- Real email sending / SMTP — password-reset & email-verify are token-issuing
  scaffolds only, as the spec labels them "Architecture".
- Real MQTT broker integration tests (service is unit-tested with a fake client).
