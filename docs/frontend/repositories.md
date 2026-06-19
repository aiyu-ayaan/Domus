# Repository Pattern & API Client

This document explains the repository abstraction layer and the HTTP networking engine used to connect the Domus UI to the REST API.

---

## 🗃️ The Repository Pattern
To maintain a clean separation of concerns, the frontend views and Zustand stores do not execute direct `fetch` requests. Instead, they interact with defined Repository classes matching abstract interfaces in [apps/web/repositories/types.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/types.ts).

This pattern provides several benefits:
1. **Mockability**: We can run the entire frontend locally without starting PostgreSQL, Redis, MQTT, or FastAPI services.
2. **Swapability**: Changing the API layer does not impact the design or styling code of the React pages.
3. **Type Safety**: The repository interfaces specify exact inputs and outputs mapped to the OpenAPI schemas in [types/api.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/types/api.ts).

### The Implementation Switch
In [apps/web/repositories/index.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/index.ts), the application determines which implementation class to instantiate using the `NEXT_PUBLIC_USE_MOCK_API` environment flag:

```typescript
const useMock = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export const authRepository = useMock
  ? new MockAuthRepository()
  : new ApiAuthRepository();
```

---

## 🔌 API Repository Implementation (`/api`)
The API repositories under [repositories/api/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/api/) translate repository calls into REST queries using the central [apiClient](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/services/api-client.ts).

### 1. `ApiClient` Configuration & Base URL
* **Base URL**: Set via `process.env.NEXT_PUBLIC_API_URL` (falls back to `http://localhost:8000`).
* **Request Timeout**: Configured with an `AbortController` set to abort after `10,000ms`.
* **Headers**: Auto-injects `"Content-Type": "application/json"` unless handling file uploads (`FormData`).

### 2. JWT Injection
On every request, the `apiClient` reads the current `accessToken` from the Zustand `useAuthStore` and appends it as a bearer header:
```typescript
const { accessToken } = useAuthStore.getState();
if (accessToken && !headers.has("Authorization")) {
  headers.set("Authorization", `Bearer ${accessToken}`);
}
```

### 3. Automatic JWT Refresh Loop (401 Interceptor)
If an API call returns a `401 Unauthorized` response, the client executes an automatic token-rotation handshake:
1. It intercepts the `401` response.
2. It checks that the request is not already an authentication request (`/auth/login`, `/auth/refresh`, or `/auth/logout`).
3. It fetches the `refreshToken` from the Zustand store.
4. It calls `POST /auth/refresh` on the backend.
5. **On Success**: It stores the new token pair, replaces the original request's authorization headers, and retries the failed operation.
6. **On Failure**: It clears the Zustand store via `logout()`, which redirects the user back to the login screen.

---

## 🧪 Mock Repository Implementation (`/mock`)
The mock classes under [repositories/mock/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/repositories/mock/) simulate the API.

### 1. In-Memory Database
All mock operations read and write to the client-side database in [mocks/mock-db.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/mocks/mock-db.ts). This simulated database stores homes, rooms, devices, integrations, automations, and notifications in-memory, mimicking the Postgres schema constraints.

### 2. Delay Emulation
To make the UI feel realistic, mock actions simulate a network latency delay of `300ms` to `600ms` before resolving.

### 3. Simulating Real-time Broadcaster
Since there is no backend WebSocket server running in mock mode, mock methods dispatch standard window CustomEvents when database modifications happen:
```typescript
window.dispatchEvent(
  new CustomEvent("domus_mock_ws_broadcast", {
    detail: {
      type: "device.state_changed",
      home_id: homeId,
      data: { device_id, state, attributes }
    }
  })
);
```
The [RealtimeProvider](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/providers/realtime-provider.tsx) intercepts this event and forwards it to the stores to simulate a live WS push notification.
