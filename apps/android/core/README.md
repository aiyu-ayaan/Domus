# `:core` — Domus API data layer

Pure data layer for the Android app. Talks to the Domus FastAPI backend over
HTTP + WebSocket. No UI. Built on Ktor + kotlinx.serialization. Manual DI — no
Hilt — through a single [`DomusCore`](src/main/java/com/atech/core/DomusCore.kt)
entry point.

## Usage

`DomusApp` (in `:app`) builds one instance per process:

```kotlin
val core = DomusCore.create(context)           // starts on http://10.0.2.2:8000
val repo = core.devices                         // ready to use
```

Reach it from a screen/ViewModel via `(application as DomusApp).core`.

## Configuring the backend URL (not hardcoded)

The URL is persisted (`ServerStore`) and changed at runtime from your settings UI:

```kotlin
core.serverUrl        // Flow<String?> — current configured URL (null until set)
core.isConfigured     // Flow<Boolean> — gate first-run UI on this
core.setBaseUrl("http://192.168.1.50:8000")   // persists, repoints live client, clears session
```

`http://10.0.2.2:8000` is the emulator's alias for the host machine's localhost.

## Auth

`AuthRepository` owns token persistence; everything else just observes the session:

```kotlin
core.auth.login(email, password)   // saves the token pair
core.isLoggedIn                    // Flow<Boolean>
core.auth.logout()
```

Access tokens are attached to every request and **refreshed transparently** on a
401 via `/auth/refresh` — callers never deal with tokens directly.

## Repositories

One per backend domain, each method returns `DomusResult<T>` (never throws for
expected failures — inspect `DomusResult.Failure.error.kind`):

| Property | Covers |
|----------|--------|
| `core.auth` | register / login / logout / change-password |
| `core.users` | `me`, profile update |
| `core.homes` | homes CRUD |
| `core.rooms` | rooms CRUD |
| `core.devices` | devices CRUD + `turnOn`/`turnOff`/`toggle`/`setAttributes` + state/history |
| `core.scenes` | scenes CRUD + `activate` |
| `core.automations` | automations CRUD + `trigger` |
| `core.energy` | usage `summary` |
| `core.notifications` | list + `markRead` |
| `core.integrations` | integrations CRUD + `available` + `discover` |

## Realtime

```kotlin
core.realtime.events().collect { event ->   // {type, data, home_id, ts}
    // device state changes, new devices, notifications…
}
```

Cold flow: connects on collection, auto-reconnects, skips malformed frames.

## Models

`@Serializable` classes in `model/` mirror the backend Pydantic schemas and serve
as both wire DTOs and domain models. UUIDs/timestamps are `String`; free-form
`meta`/`attributes`/`config` are `JsonObject`. `Json` is configured with
`ignoreUnknownKeys = true`, so the server can add fields without breaking the app.

## Deliberate omissions

- **No Room / offline cache.** The API is the source of truth; a smart-home app
  leans real-time. Add a local cache when offline browsing is actually needed.
- **No Hilt.** Manual DI via `DomusCore` is enough for one container. Wrap it in
  a Hilt module later if the graph grows.
