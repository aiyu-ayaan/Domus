# Domus API — Reference

Complete REST contract for the Domus backend. Pair this with
[`openapi.json`](./openapi.json) (machine-readable, same source of truth) and
[`realtime.md`](./realtime.md) for WebSockets.

- **Base URL (dev):** `http://localhost:8000`
- **API prefix:** all resource endpoints live under `/api/v1`
- **Content type:** `application/json` for requests and responses
- **Interactive docs:** `GET /docs` (Swagger UI), `GET /openapi.json`

---

## Authentication

JWT bearer tokens. Send the access token on every protected request:

```
Authorization: Bearer <access_token>
```

- **Access token** — short-lived (default 30 min). Carries `sub` (user id) and `role`.
- **Refresh token** — long-lived (default 30 days), stored server-side and **single-use**:
  calling `/auth/refresh` rotates it (the old one is revoked). Logout and password change
  revoke all refresh tokens.

**Bootstrap flow:** `register` (or `login`) → store both tokens → use access token →
on `401`, call `refresh` with the refresh token → replace both tokens → retry.

### Roles (RBAC)

`owner` > `admin` > `user` > `guest`. The **first** user to register becomes `owner`;
everyone else starts as `user`. Controlling a device requires `user` or higher (guests
are read-only). Role is exposed on `UserPublic.role`.

---

## Conventions

### Error envelope

Every error returns this shape (HTTP status set accordingly):

```json
{
  "error": {
    "code": "not_found",
    "message": "Device not found",
    "details": null
  }
}
```

| code               | HTTP | Meaning                                                           |
| ------------------ | ---- | ----------------------------------------------------------------- |
| `validation_error` | 422  | Body/query failed validation; `details` is a list of field errors |
| `unauthorized`     | 401  | Missing/invalid/expired token, bad credentials                    |
| `forbidden`        | 403  | Authenticated but not allowed (RBAC or not your resource)         |
| `not_found`        | 404  | Resource doesn't exist                                            |
| `conflict`         | 409  | Duplicate (e.g. email, device already registered)                 |
| `bad_request`      | 400  | Generic client error                                              |
| `http_error`       | 4xx  | Fallback for framework HTTP errors                                |

A frontend can branch on `error.code`; never parse `message`.

### Pagination, filtering, sorting

`GET /devices` returns a **page object**; other list endpoints return plain arrays.

Page object:

```json
{ "items": [ ... ], "total": 42, "limit": 50, "offset": 0 }
```

Query params (where supported): `limit` (1–200, default 50), `offset` (≥0),
`sort` (`field` or `-field` for descending). Device/notification lists also accept
resource filters (see below).

### IDs & timestamps

All ids are UUID strings. Timestamps are ISO-8601 with timezone.

---

## Enums

```
Role             owner | admin | user | guest
DeviceType       light | plug | switch | sensor | camera | thermostat | fan | lock | other
IntegrationType  tapo | xiaomi | tuya | mqtt | matter | zigbee
NotificationType device_offline | automation_failed | new_device_found | security_alert | info
TriggerType      device_state | device_offline | new_device | time | manual
ConditionOp      eq | ne | gt | lt | gte | lte | in
ActionType       device.turn_on | device.turn_off | device.toggle | scene.activate | notification.send
```

---

## Auth — `/api/v1/auth`

Rate-limited (default 10/min per IP) on register/login/refresh.

### `POST /auth/register` → 201

```json
// request
{ "email": "owner@example.com", "password": "supersecret1", "full_name": "Ada" }
// response: RegisterResponse
{
  "user": { "id": "…", "email": "owner@example.com", "full_name": "Ada",
            "avatar_url": null, "role": "owner", "is_active": true,
            "is_verified": false, "created_at": "2026-06-19T…Z" },
  "tokens": { "access_token": "…", "refresh_token": "…", "token_type": "bearer" }
}
```

`password`: 8–128 chars. Errors: `409 conflict` (email taken), `422 validation_error`.

### `POST /auth/login` → 200 → `TokenPair`

```json
{ "email": "owner@example.com", "password": "supersecret1" }
```

Errors: `401 unauthorized` (bad credentials / disabled).

### `POST /auth/refresh` → 200 → `TokenPair`

```json
{ "refresh_token": "…" }
```

Returns a new access **and** refresh token; the supplied refresh token is now revoked.
Errors: `401 unauthorized` (unknown/revoked/expired).

### `POST /auth/logout` → 204

```json
{ "refresh_token": "…" }
```

Revokes the refresh token. Always 204 (idempotent).

### `POST /auth/change-password` → 204 _(auth required)_

```json
{ "current_password": "supersecret1", "new_password": "evenbetter2" }
```

Revokes all refresh tokens. Errors: `401` (wrong current password).

---

## Users — `/api/v1/users`

### `GET /users/me` → 200 → `UserPublic`

### `PATCH /users/me` → 200 → `UserPublic`

```json
{ "full_name": "Ada L.", "avatar_url": "https://…/a.png" } // both optional
```

### `DELETE /users/me` → 204

---

## Homes — `/api/v1/homes`

A user owns many homes; every other resource hangs off a home. Owners see their homes;
admins/owners see all.

| Method | Path               | Body         | Returns         |
| ------ | ------------------ | ------------ | --------------- |
| GET    | `/homes`           | —            | `HomeOut[]`     |
| POST   | `/homes`           | `HomeCreate` | `HomeOut` (201) |
| GET    | `/homes/{home_id}` | —            | `HomeOut`       |
| PATCH  | `/homes/{home_id}` | `HomeUpdate` | `HomeOut`       |
| DELETE | `/homes/{home_id}` | —            | 204             |

```json
// HomeCreate
{ "name": "Main House", "description": "…", "timezone": "Europe/Berlin" }
// HomeOut
{ "id":"…","name":"Main House","description":"…","timezone":"Europe/Berlin",
  "owner_id":"…","created_at":"…" }
```

Errors: `403 forbidden` (not your home), `404 not_found`.

---

## Rooms — `/api/v1/rooms`

| Method | Path               | Body         | Returns                                     |
| ------ | ------------------ | ------------ | ------------------------------------------- |
| GET    | `/rooms?home_id=`  | —            | `RoomOut[]` (all your rooms, or one home's) |
| POST   | `/rooms`           | `RoomCreate` | `RoomOut` (201)                             |
| PATCH  | `/rooms/{room_id}` | `RoomUpdate` | `RoomOut`                                   |
| DELETE | `/rooms/{room_id}` | —            | 204                                         |

```json
// RoomCreate
{ "home_id": "…", "name": "Living Room", "icon": "sofa" }
// RoomOut
{ "id":"…","home_id":"…","name":"Living Room","icon":"sofa","created_at":"…" }
```

---

## Integrations — `/api/v1/integrations`

An integration is a configured connection to an ecosystem (Tapo, MQTT, …). Credentials in
`config` are **encrypted at rest and never returned**.

| Method | Path                          | Body                | Returns                      |
| ------ | ----------------------------- | ------------------- | ---------------------------- |
| GET    | `/integrations/available`     | —                   | `string[]` (supported kinds) |
| GET    | `/integrations?home_id=`      | —                   | `IntegrationOut[]`           |
| POST   | `/integrations`               | `IntegrationCreate` | `IntegrationOut` (201)       |
| GET    | `/integrations/{id}`          | —                   | `IntegrationOut`             |
| PATCH  | `/integrations/{id}`          | `IntegrationUpdate` | `IntegrationOut`             |
| DELETE | `/integrations/{id}`          | —                   | 204                          |
| POST   | `/integrations/{id}/discover` | —                   | `DiscoveryResult`            |

```json
// IntegrationCreate  (config is opaque key/values for that integration)
{ "home_id":"…","name":"My Tapo","type":"tapo","enabled":true,
  "config":{ "username":"u","password":"p" } }
// IntegrationOut  (note: no `config`)
{ "id":"…","home_id":"…","name":"My Tapo","type":"tapo","enabled":true,
  "last_sync_at":null,"created_at":"…" }
```

### Discovery

`POST /integrations/{id}/discover` queries the adapter, **persists newly found devices**,
and reports what it saw:

```json
// DiscoveryResult
{
  "integration_id": "…",
  "new_count": 2,
  "existing_count": 0,
  "discovered": [
    {
      "external_id": "tapo-p110-01",
      "name": "TP-Link Tapo Plug",
      "device_type": "plug",
      "manufacturer": "TP-Link",
      "model": "Tapo P110",
      "serial_number": "TAPO0001",
      "attributes": { "energy_monitoring": true },
      "already_registered": false
    }
  ]
}
```

Re-running discovery is idempotent — already-known devices come back with
`already_registered: true` and `new_count` drops to 0 (deduped on `integration + external_id`).

---

## Devices — `/api/v1/devices`

| Method | Path                     | Body / Query                                                 | Returns                           |
| ------ | ------------------------ | ------------------------------------------------------------ | --------------------------------- |
| GET    | `/devices`               | `home_id, room_id, device_type, online, limit, offset, sort` | `Page<DeviceOut>`                 |
| POST   | `/devices`               | `DeviceCreate`                                               | `DeviceOut` (201)                 |
| GET    | `/devices/{id}`          | —                                                            | `DeviceOut`                       |
| PATCH  | `/devices/{id}`          | `DeviceUpdate`                                               | `DeviceOut`                       |
| DELETE | `/devices/{id}`          | —                                                            | 204                               |
| POST   | `/devices/{id}/turn-on`  | —                                                            | `DeviceStateOut` _(role ≥ user)_  |
| POST   | `/devices/{id}/turn-off` | —                                                            | `DeviceStateOut` _(role ≥ user)_  |
| POST   | `/devices/{id}/toggle`   | —                                                            | `DeviceStateOut` _(role ≥ user)_  |
| GET    | `/devices/{id}/state`    | —                                                            | `DeviceStateOut` (latest)         |
| GET    | `/devices/{id}/history`  | `limit, offset`                                              | `DeviceStateOut[]` (newest first) |

```json
// DeviceOut
{ "id":"…","home_id":"…","integration_id":"…","room_id":null,
  "external_id":"tapo-p110-01","name":"TP-Link Tapo Plug",
  "manufacturer":"TP-Link","model":"Tapo P110","serial_number":"TAPO0001",
  "device_type":"plug","online":true,"last_seen":"…","meta":{},"created_at":"…" }
// DeviceStateOut
{ "id":"…","device_id":"…","state":"on","attributes":{"mock":true},"created_at":"…" }
```

- Devices are normally created by **discovery**, not `POST /devices`. Manual create requires
  a valid `integration_id` in the same home and a unique `external_id`.
- Control always routes through the integration adapter, records a new `DeviceState`, sets
  `online=true`/`last_seen`, and emits a `device.state_changed` WebSocket event.
- `state` values are canonical strings: `on` | `off` | `open` | `closed` | `unknown`.
- `GET /devices/{id}/state` returns `404 not_found` if the device was never controlled.
- Errors: `403` (guest tried to control / not your device), `409 conflict` (integration disabled).

---

## Scenes — `/api/v1/scenes`

A scene is a named set of desired device states, applied together.

| Method | Path                    | Body          | Returns               |
| ------ | ----------------------- | ------------- | --------------------- |
| GET    | `/scenes?home_id=`      | —             | `SceneOut[]`          |
| POST   | `/scenes`               | `SceneCreate` | `SceneOut` (201)      |
| GET    | `/scenes/{id}`          | —             | `SceneOut`            |
| PATCH  | `/scenes/{id}`          | `SceneUpdate` | `SceneOut`            |
| DELETE | `/scenes/{id}`          | —             | 204                   |
| POST   | `/scenes/{id}/activate` | —             | `SceneActivateResult` |

```json
// SceneCreate
{ "home_id":"…","name":"Movie Night","description":"…",
  "states":[ { "device_id":"…","state":"off","attributes":{} },
             { "device_id":"…","state":"on","attributes":{} } ] }
// SceneActivateResult
{ "scene_id":"…","applied":2,"failed":0 }
```

Activation drives each device through its adapter; `state:"off"` → turn-off, anything else
→ turn-on. One failing device increments `failed` without aborting the rest.

---

## Automations — `/api/v1/automations`

`IF (trigger + conditions) THEN (actions)`. See [`automations.md`](./automations.md) for the
full model and examples.

| Method | Path                        | Body               | Returns               |
| ------ | --------------------------- | ------------------ | --------------------- |
| GET    | `/automations?home_id=`     | —                  | `AutomationOut[]`     |
| POST   | `/automations`              | `AutomationCreate` | `AutomationOut` (201) |
| GET    | `/automations/{id}`         | —                  | `AutomationOut`       |
| PATCH  | `/automations/{id}`         | `AutomationUpdate` | `AutomationOut`       |
| DELETE | `/automations/{id}`         | —                  | 204                   |
| POST   | `/automations/{id}/trigger` | `context` (object) | `AutomationRunResult` |

```json
// AutomationCreate
{ "home_id":"…","name":"Motion → light","enabled":true,
  "trigger":{ "type":"device_state","device_id":"…","state":"on" },
  "conditions":[ { "field":"lux","op":"lt","value":10 } ],
  "actions":[ { "type":"device.turn_on","device_id":"…" },
              { "type":"notification.send","title":"Motion","body":"Light on" } ] }
// AutomationRunResult (from manual trigger)
{ "automation_id":"…","matched":true,"executed":true,"error":null }
```

`POST /automations/{id}/trigger` runs the rule now (skips trigger matching, still checks
conditions) with the posted object as the evaluation `context`. `actions` requires ≥1 item.

---

## Notifications — `/api/v1/notifications`

| Method | Path                       | Query                            | Returns                            |
| ------ | -------------------------- | -------------------------------- | ---------------------------------- |
| GET    | `/notifications`           | `home_id, unread, limit, offset` | `NotificationOut[]` (newest first) |
| POST   | `/notifications/{id}/read` | —                                | `NotificationOut`                  |

```json
// NotificationOut
{
  "id": "…",
  "home_id": "…",
  "type": "automation_failed",
  "title": "…",
  "body": "…",
  "read": false,
  "meta": {},
  "created_at": "…"
}
```

Notifications are raised by the system (discovery, failed automations, `notification.send`
actions). `unread=true` filters to unread.

---

## System

| Method | Path            | Returns                                         |
| ------ | --------------- | ----------------------------------------------- |
| GET    | `/health`       | `{ "status":"ok","service":"domus-api" }`       |
| GET    | `/health/ready` | `{ "status":"ok","redis":"ok"\|"unreachable" }` |

---

See [`data-model.md`](./data-model.md) for entity relationships and
[`frontend-guide.md`](./frontend-guide.md) for recommended build order and screen mapping.
