# Real-Time WebSocket Synchronization

This document explains how the Domus web application uses WebSockets to reflect live smart home status, device updates, online states, and system notifications in the UI.

---

## ⚡ WebSocket Client Lifecycle

The real-time layer is managed by the client-side provider in [apps/web/providers/realtime-provider.tsx](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/providers/realtime-provider.tsx).

### 1. Connection Initialization

The WebSocket connection is established when the following conditions are met:

- The user is authenticated (`isAuthenticated` is `true`).
- An active `accessToken` is present in the Zustand store.
- `NEXT_PUBLIC_USE_MOCK_API` is set to `"false"`.

The connection URL is structured as:

```
ws://<api-host>/ws?token=<access_token>
```

The endpoint is defined in the backend router [apps/api/backend/websocket/router.py](file:///d:/VS-Code/AI%20Expermients/Domus/apps/api/backend/websocket/router.py). The query parameter token is parsed and authenticated against database user profiles.

### 2. Disconnect & Reconnect Loop

- **Clean Disconnect**: If the user logs out or the JWT expires, the provider closes the WebSocket cleanly.
- **Access Violation (Status 1008)**: If the backend terminates the connection with code `1008 POLICY_VIOLATION` (due to an expired or invalid token), the reconnect loop is bypassed. The frontend relies on the `apiClient`'s 401 interceptor to refresh the token first.
- **Network Drops**: For other connection closures, the client triggers an auto-reconnect loop, attempting to re-establish the connection every `2,000ms`.

---

## 📥 Event Handlers & State Mapping

When a JSON packet is received over the WebSocket, it is handled by `handleSocketMessage()`. Events are ignored if the event's `home_id` does not match the active home selected by the user.

Here is the catalog of websocket events and how they map to Zustand store mutations:

### 1. `device.state_changed`

- **Triggered by**: Telemetry adjustments (temperature shifts, plug power draws, light dimming).
- **Payload**:
  ```json
  {
    "type": "device.state_changed",
    "home_id": "uuid-home-id",
    "data": {
      "device_id": "uuid-device-id",
      "state": "on",
      "attributes": { "current_consumption": 45.2 }
    }
  }
  ```
- **Store Action**: Creates a `DeviceStateOut` DTO and calls `useDeviceStore.getState().updateDeviceStateInStore(device_id, newState)`.

### 2. `device.online_changed`

- **Triggered by**: A device disconnecting from or reconnecting to its integration bridge.
- **Payload**:
  ```json
  {
    "type": "device.online_changed",
    "home_id": "uuid-home-id",
    "data": {
      "device_id": "uuid-device-id",
      "online": false
    }
  }
  ```
- **Store Action**: Updates the device status via `useDeviceStore.getState().updateDeviceInStore(device_id, { online })`.
- **Toast Alert**: If `online` is `false`, triggers a `toast.error` informing the user that the device has lost connection.

### 3. `notification.created`

- **Triggered by**: Alarms, automation errors, or security events.
- **Payload**:
  ```json
  {
    "type": "notification.created",
    "home_id": "uuid-home-id",
    "data": {
      "id": "uuid-notification-id",
      "title": "Motion Detected",
      "notification_type": "security_alert"
    }
  }
  ```
- **Store Action**: Calls `useNotificationStore.getState().fetchNotifications(homeId)` to refresh the activity feed.
- **Toast Alert**: Triggers a global warning toast alerting the user.

### 4. `integration.new_device_found`

- **Triggered by**: An integration scanner finding a new smart-home accessory.
- **Payload**:
  ```json
  {
    "type": "integration.new_device_found",
    "home_id": "uuid-home-id",
    "data": { "name": "Living Room Lamp" }
  }
  ```
- **Store Action**: Triggers parallel re-fetches for `fetchDevices(homeId)` and `fetchIntegrations(homeId)`.
- **Toast Alert**: Triggers a success toast with an "Assign" call-to-action button linking the user to the device settings page.

---

## 🧪 Mock WebSocket Simulator

When `process.env.NEXT_PUBLIC_USE_MOCK_API` is active, the provider starts a simulated mock event channel:

1. **Manual Action Listener**: Listens for window event `"domus_mock_ws_broadcast"` dispatched by mock repositories, updating the local Zustand store state immediately.
2. **Interval Generator**: Every **18 seconds**, it picks a random event to simulate background activity:
   - _Telemetry Fluctuations_: Varies power draws on smart plugs or temperatures on thermostats.
   - _Presence Toggles_: Randomly drops/restores device online connections.
   - _Alarms_: Generates fake security or automation failures and pops toast alerts.
