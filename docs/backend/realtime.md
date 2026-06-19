# Domus — Real-time (WebSocket)

The backend pushes live updates over a single WebSocket. Use it to keep a dashboard in
sync instead of polling.

## Connect

```
ws://localhost:8000/ws?token=<access_token>
```

- Auth is via the **access token** as a `token` query param (browsers can't set headers on
  `WebSocket`). Invalid/expired token → the socket is closed with code `1008`.
- A connection is scoped to the homes the user owns; you only receive events for those homes
  (plus unscoped broadcasts).
- The client doesn't need to send anything. You may send pings/text to keep the socket warm;
  inbound messages are ignored.
- On `1008`, refresh the access token and reconnect.

## Message shape

Every server message is JSON:

```json
{ "type": "device.state_changed",
  "data": { "device_id": "…", "state": "on", "attributes": { "mock": true } },
  "home_id": "…",
  "ts": "2026-06-19T12:00:00+00:00" }
```

`home_id` may be `null` for global broadcasts. `ts` is ISO-8601 UTC.

## Event types

| `type` | When | `data` |
|--------|------|--------|
| `presence.updated` | a user connects/disconnects | `{ "online_users": ["<user_id>", …] }` |
| `device.state_changed` | a device is controlled or reports state | `{ device_id, state, attributes }` |
| `device.online_changed` | a device goes online/offline | `{ device_id, online }` |
| `notification.created` | a notification is raised | `{ id, title, notification_type }` |
| `integration.new_device_found` | discovery finds a new device | `{ name, external_id }` |
| `mqtt.message` | an MQTT message arrives (if MQTT enabled) | `{ topic, payload }` |
| `dashboard.updated` | reserved for aggregate dashboard refreshes | `{ … }` |

A frontend can switch on `type` and update local state (e.g. patch the device in a
TanStack Query cache by `data.device_id`).

## Client example

```ts
function connect(accessToken: string, onEvent: (e: any) => void) {
  const ws = new WebSocket(`ws://localhost:8000/ws?token=${accessToken}`);
  ws.onmessage = (m) => onEvent(JSON.parse(m.data));
  ws.onclose = (e) => {
    if (e.code === 1008) {/* refresh token, then reconnect */}
    else setTimeout(() => connect(accessToken, onEvent), 1000);
  };
  return ws;
}
```

## Scaling note

With multiple API workers, events are fanned out across processes over Redis pub/sub, so a
device controlled on one worker still reaches clients connected to another. This is
transparent to the client.
