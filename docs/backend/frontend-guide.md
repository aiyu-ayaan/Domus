# Building a Frontend on Domus

A practical map from the API to a dashboard UI. Read alongside
[`api-reference.md`](./api-reference.md), [`realtime.md`](./realtime.md), and the
machine-readable [`openapi.json`](./openapi.json) (feed it to an OpenAPI client generator
to get typed bindings for free).

## Recommended stack

The repo's web app is Next.js 15 + React 19 + Tailwind + shadcn/ui, TanStack Query for
server state, Zustand for UI state, and a WebSocket for live updates. Nothing in the API
requires that stack — it's plain REST + JWT + WS.

## 1. Auth & session

1. **Register/Login** → store `access_token` + `refresh_token` (in memory + a refresh token
   in an httpOnly cookie if you have an SSR layer; otherwise secure storage).
2. Attach `Authorization: Bearer <access_token>` to every `/api/v1/*` request.
3. On any `401`, call `POST /auth/refresh` with the refresh token, swap **both** tokens,
   retry the original request once. If refresh also 401s → send the user to login.
4. **Logout** → `POST /auth/logout` with the refresh token, clear local tokens.

The first account created becomes `owner`. Gate destructive UI on `user.role` (guests are
read-only and will get `403` on control endpoints).

## 2. Bootstrap data

After login, load in this order (each depends on the previous for ids):

```
GET /users/me                      → current user + role
GET /homes                         → pick/select a home  (home_id drives everything)
GET /rooms?home_id=…               → room grouping
GET /integrations?home_id=…        → configured integrations
GET /devices?home_id=…             → Page<DeviceOut>; render the dashboard
GET /scenes?home_id=…              → scene buttons
GET /automations?home_id=…         → rules list
GET /notifications?home_id=…       → activity feed
```

Hold the selected `home_id` in UI state; pass it as a query param everywhere.

## 3. Screen → endpoint mapping

| Screen                  | Reads                                       | Writes                             |
| ----------------------- | ------------------------------------------- | ---------------------------------- |
| Login / Register        | —                                           | `auth/login`, `auth/register`      |
| Home switcher           | `GET /homes`                                | `POST/PATCH/DELETE /homes`         |
| Dashboard (device grid) | `GET /devices` (+ filters)                  | control endpoints                  |
| Device detail           | `GET /devices/{id}`, `…/state`, `…/history` | `PATCH`, control                   |
| Rooms                   | `GET /rooms`                                | room CRUD                          |
| Integrations            | `GET /integrations`, `…/available`          | integration CRUD, `…/discover`     |
| Scenes                  | `GET /scenes`                               | scene CRUD, `…/activate`           |
| Automations             | `GET /automations`                          | automation CRUD, `…/trigger`       |
| Notifications           | `GET /notifications`                        | `…/read`                           |
| Settings/profile        | `GET /users/me`                             | `PATCH /users/me`, change-password |

## 4. Controlling devices

```
POST /devices/{id}/turn-on | turn-off | toggle   → DeviceStateOut
```

Returns the new `DeviceState`. For optimistic UI: flip the toggle immediately, reconcile
with the returned `state`, and let the incoming `device.state_changed` WS event be the
source of truth.

## 5. Live updates

Open one WebSocket (`/ws?token=…`) for the session and patch your caches on events:

- `device.state_changed` → update device `data.device_id` in the device cache.
- `notification.created` → prepend to the activity feed / bump an unread badge.
- `presence.updated` → show who's online (`data.online_users`).
- `integration.new_device_found` → toast + refetch devices.

See [`realtime.md`](./realtime.md) for the full event catalog and a reconnect snippet.

## 6. Errors

Every error is `{ "error": { "code, message, details } }`. Branch on `code`
(`validation_error`, `unauthorized`, `forbidden`, `not_found`, `conflict`). For
`validation_error`, `details` is a field-level list you can map onto form inputs.

## 7. Adding an integration & discovering devices

```
GET  /integrations/available                 → kinds to offer in a dropdown
POST /integrations { home_id, name, type, config }   → create (config encrypted server-side)
POST /integrations/{id}/discover             → DiscoveryResult; new devices auto-appear
GET  /devices?home_id=…                       → refresh the grid
```

`config` is opaque per integration (credentials/keys) and is never returned — treat it as
write-only in the UI.

## Pagination

`GET /devices` returns `{ items, total, limit, offset }`. Use `limit`/`offset` for paging
and `sort=name` / `sort=-created_at` for ordering. Other lists return plain arrays.
