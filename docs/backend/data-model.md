# Domus — Data Model

Entities and how they relate. All primary keys are UUIDs; most rows carry
`created_at`/`updated_at`. Everything below the user hangs off a **home**, which is the
authorization boundary.

## Relationships

```
User (1) ──owns──> (N) Home
                       │
        ┌──────────────┼───────────────┬─────────────┬──────────────┐
        ▼              ▼                ▼             ▼              ▼
      Room (N)    Integration (N)    Scene (N)   Automation (N)  Notification (N)
        │              │                │
        │              ▼                ▼
        │          Device (N) ◄─────  SceneDeviceState (N) ──> Device
        │              │
        └──(optional)──┘  (Device.room_id, nullable)
                       │
                       ▼
                 DeviceState (N)   (append-only history; latest = current)

User (1) ──> (N) RefreshToken   (revocable, rotated on refresh)
```

## Entities

| Entity               | Key fields                                                                                                                         | Notes                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **User**             | email (unique), password_hash, full_name?, avatar_url?, role, is_active, is_verified                                               | bcrypt hash; role ∈ owner/admin/user/guest   |
| **RefreshToken**     | user_id, jti (unique), expires_at, revoked                                                                                         | server-side so refresh is revocable          |
| **Home**             | name, description?, timezone, owner_id                                                                                             | auth boundary; user owns many                |
| **Room**             | home_id, name, icon?                                                                                                               | grouping for devices                         |
| **Integration**      | home_id, name, type, enabled, last_sync_at?, config_encrypted?                                                                     | credentials Fernet-encrypted, never returned |
| **Device**           | home_id, integration_id, room_id?, external_id, name, manufacturer?, model?, serial_number?, device_type, online, last_seen?, meta | unique on (integration_id, external_id)      |
| **DeviceState**      | device_id, state, attributes, created_at                                                                                           | append-only; latest row is current state     |
| **Scene**            | home_id, name, description?                                                                                                        | has many SceneDeviceState                    |
| **SceneDeviceState** | scene_id, device_id, state, attributes                                                                                             | desired state when scene activates           |
| **Automation**       | home_id, name, enabled, trigger(json), conditions(json), actions(json), last_triggered_at?, last_error?                            | rule stored as JSON; see automations.md      |
| **Notification**     | home_id, type, title, body, read, meta                                                                                             | raised by system events                      |

## Cascade behavior

- Deleting a **Home** cascades to its rooms, integrations, devices, scenes, automations,
  notifications.
- Deleting an **Integration** cascades to its devices (and their state history).
- Deleting a **Room** sets `Device.room_id` to NULL (devices survive).
- Deleting a **Device** cascades to its state history and scene-state references.

## Ownership / visibility rules (enforced server-side)

- A user sees and mutates only resources under homes they own. `admin`/`owner` roles see all.
- Reaching another user's resource → `403 forbidden`; a missing one → `404 not_found`.
- Device **control** (on/off/toggle) additionally requires role ≥ `user` (guests read-only).
