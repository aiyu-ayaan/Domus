# State Management Guide (Zustand)

This document covers how application state, filtering, user sessions, and cache reconciliation are managed using **Zustand** in the Domus frontend (`apps/web`).

---

## 🧠 State Management Philosophy
Domus uses **Zustand** for state management because it provides a lightweight, hook-based, and performant state container without the boilerplate of Redux or context re-render penalties.

The state is organized into **domain-specific stores** inside the [apps/web/stores/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/) directory. Each store wraps access to the repository layer, performing HTTP requests and updating the local client state.

---

## 🗄️ Store Catalog

### 1. `useAuthStore`
* **File**: [auth-store.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/auth-store.ts)
* **Responsibility**: Manages the logged-in user, JWT access/refresh tokens, loading status, and authentication error envelopes.
* **Key State**:
  - `user: UserPublic | null`
  - `accessToken: string | null`
  - `refreshToken: string | null`
  - `isAuthenticated: boolean`
  - `rememberMe: boolean`
* **Key Actions**:
  - `initializeAuth()`: Invoked on app startup; reads tokens from either `localStorage` (if `rememberMe` is active) or `sessionStorage`, then validates them by calling the user profile API endpoint.
  - `login(req)` / `register(req)`: Calls the auth repository, obtains new token pairs, and updates states.
  - `logout()`: Informs the backend of token revocation, then clears local storage keys.

### 2. `useHomeStore`
* **File**: [home-store.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/home-store.ts)
* **Responsibility**: Manages the listing of houses/workspaces owned by or accessible to the user, and tracks the active tenant workspace.
* **Key State**:
  - `homes: HomeOut[]`
  - `activeHomeId: string | null`
* **Key Actions**:
  - `fetchHomes()`: Loads homes and auto-selects a default home, checking if a preference exists under the `domus_active_home_id` localStorage key.
  - `setActiveHomeId(id)`: Changes the active scope and persists it to local storage. All other stores react to this change to load home-specific resources.

### 3. `useRoomStore`
* **File**: [room-store.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/room-store.ts)
* **Responsibility**: Manages the partitions/rooms within the selected home workspace.
* **Key Actions**:
  - `fetchRooms(homeId)`: Refetches the room array.
  - `createRoom(req)` / `updateRoom(id, req)` / `deleteRoom(id)`: Performs CRUD mutations and synchronizes the local cache.

### 4. `useDeviceStore`
* **File**: [device-store.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/device-store.ts)
* **Responsibility**: The heart of the dashboard. Manages the device inventory, filter options (search query, room group, device type, online status), and tracks live attributes for online devices.
* **Key State**:
  - `devices: DeviceOut[]`
  - `deviceStates: Record<string, DeviceStateOut>` (mapping from `deviceId` to state attributes like brightness, temperature, or toggle)
* **Optimistic Controls**:
  For rapid responsiveness, actions like `turnOnDevice`, `turnOffDevice`, and `toggleDevice` immediately rewrite the client-side state in `deviceStates` with predicted values (e.g. state = `"on"`). They then trigger the backend API call. If the API fails, the state is reverted back to the cached `originalState`.
* **Telemetry Sync**:
  - `updateDeviceInStore(id, updates)`: Replaces device schema fields.
  - `updateDeviceStateInStore(id, newState)`: Integrates live socket telemetry updates into `deviceStates`.

### 5. `useIntegrationStore`
* **File**: [integration-store.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/integration-store.ts)
* **Responsibility**: Controls connectors (Tapo, Xiaomi, Tuya, Matter, Zigbee, MQTT), listing status, and scanning/device discovery progress.

### 6. `useNotificationStore`
* **File**: [notification-store.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/stores/notification-store.ts)
* **Responsibility**: Handles alert banners, unread counts, and notifications history lists.

---

## 🔄 Bootstrap & Fetching Lifecycle
When a user visits the dashboard, data fetching proceeds in a cascaded pipeline:

```
[initializeAuth()]
       │
       ▼ (if Authenticated)
[fetchHomes()] ──► Selects activeHomeId
       │
       ├──► [fetchRooms(activeHomeId)]
       ├──► [fetchDevices(activeHomeId)] ──► fetches state for each online device
       ├──► [fetchIntegrations(activeHomeId)]
       └──► [fetchNotifications(activeHomeId)]
```

> [!IMPORTANT]
> Always use hooks to bind states. E.g. `const activeHomeId = useHomeStore((state) => state.activeHomeId);`. This ensures components only re-render when the selected field changes.
