# Domus Backend — Documentation

Everything a developer (or an AI agent) needs to build a client against the Domus API,
without reading the backend source.

## Start here

| Doc | What's in it |
|-----|--------------|
| [api-reference.md](./api-reference.md) | Every endpoint: auth, conventions, error envelope, pagination, request/response shapes, enums |
| [data-model.md](./data-model.md) | Entities, relationships, cascade & ownership rules |
| [realtime.md](./realtime.md) | WebSocket: connect, auth, message shape, event catalog |
| [automations.md](./automations.md) | The IF/THEN rule model with worked examples |
| [frontend-guide.md](./frontend-guide.md) | Build order, screen→endpoint map, live-update wiring |
| [openapi.json](./openapi.json) | Machine-readable OpenAPI 3.1 spec — feed to a client generator |

## TL;DR for a frontend

- Base URL `http://localhost:8000`, resources under `/api/v1`.
- Auth: JWT bearer. `register`/`login` → access + refresh tokens; refresh rotates.
- Everything hangs off a **home** (`home_id`); pass it as a query param.
- Real-time over `ws://…/ws?token=<access_token>`.
- Errors are always `{ "error": { code, message, details } }` — branch on `code`.

## Regenerating `openapi.json`

It's generated from the live app, so it never drifts:

```bash
cd apps/api
python -c "import json; from backend.main import app; \
  open('../../docs/backend/openapi.json','w').write(json.dumps(app.openapi(), indent=2))"
```

See [`../../apps/api/README.md`](../../apps/api/README.md) to run the backend itself.
