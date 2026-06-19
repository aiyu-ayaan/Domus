# Domus — Automations

`IF (trigger fires AND all conditions pass) THEN (run actions in order)`.

A rule is stored as three JSON blocks on the `Automation`: `trigger`, `conditions`,
`actions`. They are validated by Pydantic on write, so malformed rules are rejected with
`422 validation_error`.

## Trigger

```json
{ "type": "device_state", "device_id": "…", "state": "on", "at": null }
```

| `type`           | Fires when                                | Relevant fields                                                                           |
| ---------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `device_state`   | a device emits a state                    | `device_id` (optional — any device if omitted), `state` (optional — any state if omitted) |
| `device_offline` | a device goes offline                     | `device_id`                                                                               |
| `new_device`     | discovery registers a new device          | —                                                                                         |
| `time`           | scheduled / sunset                        | `at` (e.g. `"22:00"` or `"sunset"`) — fired by a scheduler or manual trigger              |
| `manual`         | only via `POST /automations/{id}/trigger` | —                                                                                         |

> Event-driven triggers (`device_state`, `new_device`) fire automatically off the event bus
> **on PostgreSQL**. Locally on SQLite, use the manual trigger endpoint to exercise rules
> (SQLite's single writer blocks the engine's side session).

## Conditions (AND)

A list; **all** must pass. Each is `field op value`, evaluated against a context object
(event data for event-driven runs, or the JSON you POST for manual runs).

```json
[
  { "field": "lux", "op": "lt", "value": 10 },
  { "field": "state", "op": "eq", "value": "on" }
]
```

`op` ∈ `eq | ne | gt | lt | gte | lte | in`. A missing field or a type-incompatible compare
makes that condition false (so the rule does not run). Empty list = always pass.

## Actions (ordered)

```json
[
  { "type": "device.turn_on", "device_id": "…" },
  { "type": "device.turn_off", "device_id": "…" },
  { "type": "device.toggle", "device_id": "…" },
  { "type": "scene.activate", "scene_id": "…" },
  { "type": "notification.send", "title": "Hi", "body": "…" }
]
```

At least one action is required. If an action throws, the rule records `last_error` and
raises an `automation_failed` notification; remaining actions still attempt to run via the
engine's error handling.

## Worked examples

**Motion → light (with darkness condition)**

```json
{
  "name": "Hall motion light",
  "trigger": { "type": "device_state", "device_id": "<motion>", "state": "on" },
  "conditions": [{ "field": "lux", "op": "lt", "value": 10 }],
  "actions": [{ "type": "device.turn_on", "device_id": "<light>" }]
}
```

**Sunset → garden lights**

```json
{
  "name": "Garden at sunset",
  "trigger": { "type": "time", "at": "sunset" },
  "conditions": [],
  "actions": [{ "type": "scene.activate", "scene_id": "<garden_scene>" }]
}
```

**Device offline → notify**

```json
{
  "name": "Camera offline alert",
  "trigger": { "type": "device_offline", "device_id": "<camera>" },
  "conditions": [],
  "actions": [{ "type": "notification.send", "title": "Camera offline" }]
}
```

## Testing a rule from a frontend

`POST /automations/{id}/trigger` with a JSON body that becomes the condition context:

```json
// body
{ "lux": 5, "state": "on" }
// response
{ "automation_id": "…", "matched": true, "executed": true, "error": null }
```

`executed: false` means the conditions did not pass.
