# Docus System Architecture

Docus is a local-first smart-home hub: a Rust modular monolith with SQLite,
a React web UI (also wrapped by Electron), and pluggable device integrations.
Everything runs on the home server; cloud APIs are used only where a vendor
offers no local alternative (Tuya) or to fetch device keys (Xiaomi).

## 1. Component overview

```mermaid
flowchart LR
    subgraph Clients
        Web["React web UI<br/>(liquid glass)"]
        Desk["Electron shell"]
    end

    subgraph Server["backend/ — Rust (Axum, Tokio)"]
        direction TB
        TLS["HTTPS (rustls)<br/>self-signed or custom cert"]
        Auth["JWT auth middleware<br/>role + room access from DB"]
        subgraph Modules["modules/"]
            M1["auth · users"]
            M2["devices · discovery · groups"]
            M3["rooms · scenes · automations"]
            M4["energy · notifications"]
            M5["integrations (accounts, Tuya QR)"]
        end
        WS["/ws live events"]
        Mgr["DeviceManager<br/>poll · discover · adopt · command"]
        Engine["AutomationEngine<br/>edge triggers · conditions · actions"]
        Bus(("EventBus<br/>tokio broadcast"))
        Workers["workers/<br/>poller · discovery · scheduler"]
        Vault["Vault (AES-256-GCM)"]
    end

    subgraph Plugins["integrations/ — IntegrationPlugin"]
        Tuya["Tuya / Smart Life<br/>cloud, QR login"]
        Tapo["Tapo<br/>local KLAP + UDP 20002"]
        Xiaomi["Xiaomi<br/>Mi cloud tokens + local miIO"]
        Virtual["Virtual demo devices"]
    end

    DB[("SQLite (WAL)<br/>data/docus.db")]
    Key[["data/master.key<br/>data/jwt.secret<br/>data/tls/"]]

    Web & Desk -->|HTTPS + WSS| TLS --> Auth --> Modules
    Auth --> WS
    Modules --> Mgr
    Modules --> DB
    Mgr --> Plugins
    Mgr --> Bus
    Mgr --> Vault
    Vault -.key.-> Key
    Bus --> Engine --> Mgr
    Bus --> WS
    Workers --> Mgr
    Workers --> Engine
    Mgr --> DB
```

`crates/home-core` holds the shared domain model: `DeviceState`,
`DeviceCommand`, `DiscoveredDevice`, automation `Trigger`/`Condition`/`Action`,
and the `IntegrationPlugin` contract every integration implements.

## 2. Integration plugin contract

```mermaid
classDiagram
    class IntegrationPlugin {
        <<trait>>
        +integration_type() IntegrationType
        +discover(accounts) Vec~DiscoveredDevice~
        +probe(host, secrets, accounts) DiscoveredDevice
        +fetch_states(devices) Map~id, PolledState~
        +fetch_state(device) PolledState
        +send_command(device, command)
    }
    class CredentialStore {
        <<trait>>
        +save_credentials(account_id, json)
    }
    IntegrationPlugin <|.. TuyaIntegration
    IntegrationPlugin <|.. TapoIntegration
    IntegrationPlugin <|.. XiaomiIntegration
    IntegrationPlugin <|.. VirtualIntegration
    TuyaIntegration --> CredentialStore : persists refreshed tokens
    XiaomiIntegration --> CredentialStore : persists re-login
    DeviceManager --> IntegrationPlugin : only caller
```

Plugins never touch the database. The `DeviceManager` decrypts credentials and
device secrets, builds a `DeviceContext`, and stores whatever comes back.
`fetch_states` is batched so cloud plugins (Tuya) answer a whole home in one call.

## 3. Discovery and adoption

```mermaid
sequenceDiagram
    autonumber
    participant W as DiscoveryWorker
    participant M as DeviceManager
    participant P as Plugins
    participant DB as SQLite
    participant N as Notifier / EventBus
    participant UI as Web UI

    W->>M: discover() every N min (settings.enabled)
    M->>P: discover(accounts) — all plugins concurrently
    P-->>M: DiscoveredDevice[] (Tapo UDP beacons, miIO hello,<br/>Tuya/Xiaomi account device lists)
    alt already adopted
        M->>DB: refresh IP / keys / account on device
    else new device
        M->>DB: upsert discovered_devices (status pending)
        alt settings.auto_adopt and no blocking note
            M->>DB: insert device, mark adopted
            M->>N: "New device added"
        else
            M->>N: DeviceDiscovered + "New device found"
        end
    end
    N-->>UI: WebSocket event → toast + Discovered badge
    UI->>M: POST /discovery/{id}/adopt {name, room, token?}
    M->>P: probe() again if the scan could not identify it
    M->>DB: insert device (secrets sealed with the vault)
```

Ignored devices stay ignored across scans; removing a device deletes its
discovery entry so it can be found again.

## 4. Tuya QR login (same flow as Home Assistant)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as Plugins screen
    participant B as Backend
    participant T as Tuya (apigw.iotbing.com)
    participant App as Smart Life app

    U->>App: Me → Settings → Account and Security → User Code
    U->>UI: paste user code
    UI->>B: POST /integrations/tuya/qr {user_code}
    B->>T: POST /v1.0/m/life/home-assistant/qrcode/tokens
    T-->>B: qrcode token
    B-->>UI: "tuyaSmart--qrLogin?token=…" (rendered as QR)
    U->>App: scan QR, confirm
    loop every 2 s
        UI->>B: GET /integrations/tuya/qr/{token}
        B->>T: GET …/qrcode/tokens/{token}
    end
    T-->>B: access/refresh token, uid, regional endpoint
    B->>B: seal credentials, create account, start discovery
    B-->>UI: linked
```

Afterwards every request to the regional endpoint is signed (HMAC-SHA256 over
headers + encrypted payload) and query/body/result are AES-128-GCM encrypted.
Tokens refresh automatically and are written back through `CredentialStore`.

## 5. Local protocols

| Integration | Discovery | Control | Secrets |
|---|---|---|---|
| Tapo | UDP broadcast to :20002 | KLAP v2/v1 over HTTP: handshake proves both sides know the account hash, then AES-128-CBC with per-request sequence IV and SHA-256 signature | TP-Link email/password (sealed) |
| Xiaomi | Mi cloud device list (token + LAN IP) and miIO hello broadcast on :54321 | miIO UDP, AES-128-CBC keyed by MD5(token); MIoT `get/set_properties` mapped from miot-spec.org | Account password + device tokens (sealed) |
| Tuya | Smart Life homes → devices → DP specifications | Cloud commands on DP codes, scaled using the DP spec | OAuth tokens + local keys (sealed) |

## 6. State, events and energy

```mermaid
flowchart LR
    Poll["DeviceWorker<br/>every 15 s"] --> FS["plugin.fetch_states"]
    FS --> Diff{"state or online<br/>changed?"}
    Diff -- yes --> Save["UPDATE devices"] --> Ev["DeviceStateChanged<br/>(with previous state)"]
    Diff -- 2 failures --> Off["mark offline"] --> Ev
    FS --> Meter{"power reported?"}
    Meter -- "≥ 60 s since last sample" --> EM["INSERT energy_metrics<br/>kWh = W × Δt"]
    Ev --> AE["AutomationEngine<br/>edge-triggered rules"]
    Ev --> WSS["WebSocket → UI cache"]
    Cmd["POST /devices/{id}/command"] --> Send["plugin.send_command"] --> Opt["optimistic state"] --> Ev
    Send -. "1.5 s later" .-> Refresh["refresh device"]
```

Energy samples store *incremental* kWh, so bills are plain sums: today, the
current billing cycle (custom start day), a projection to cycle end, budget
usage, and per-device breakdown. History is bucketed in 15-minute UTC slots so
half-hour time zones (e.g. IST) aggregate correctly into local hours.

## 7. Security model

```mermaid
flowchart TB
    Req["Request"] --> HTTPS["TLS (rustls, ring)"]
    HTTPS --> Pub{"public route?<br/>health, setup-status,<br/>setup, login"}
    Pub -- no --> JWT["verify JWT (HS256,<br/>secret in data/jwt.secret)"]
    JWT --> Load["load user from DB<br/>role + all_rooms"]
    Load --> Role{"handler checks"}
    Role --> Admin["admin: manage everything"]
    Role --> Member["member: control devices in allowed rooms"]
    Role --> Guest["guest: view devices in allowed rooms"]
```

- **Transport:** HTTPS/WSS by default; a self-signed certificate covering
  localhost, the hostname and LAN IP is generated on first start. Electron
  trusts that certificate for the Docus origin only.
- **At rest:** integration credentials and device secrets (Tuya local keys,
  miIO tokens) are sealed with AES-256-GCM. The master key is kept outside the
  database (`DOCUS_MASTER_KEY` or `data/master.key`, mode 0600). Passwords use Argon2.
- **Accounts:** first-run setup creates the admin and then locks; only admins
  create users. Roles and room access are re-read on every request, so changes
  apply immediately. Device and WebSocket data are filtered by room access.

## 8. Web UI structure

```mermaid
flowchart TB
    Main["main.tsx<br/>QueryClient · Toasts · MotionConfig(reducedMotion=user)"] --> AuthP["AuthProvider"]
    AuthP -->|no user| AuthScreen["Setup / Sign in"]
    AuthP -->|user| Router["BrowserRouter"]
    Router --> Shell["AppShell<br/>glass sidebar · glass tab bar · toolbar<br/>useLiveEvents (WebSocket → cache)"]
    Shell --> Home["Dashboard"]
    Shell --> Devices["Devices · Discovered · Groups"]
    Shell --> Rooms["Rooms / Room detail"]
    Shell --> Auto["Automations & Scenes"]
    Shell --> Energy["Energy"]
    Shell --> Plugins["Plugins (admin)"]
    Shell --> Settings["Settings · People & access"]
```

Design rules (from the Liquid Glass guidance): glass is reserved for the
navigation/control layer (sidebar, tab bar, toolbar, sheets, segmented
controls); content uses calm surfaces. Selection pills morph between items
via shared layout IDs, the web counterpart of `glassEffectID`. Reduced
transparency swaps glass for solid surfaces; reduced motion disables springs
and the ambient backdrop drift.

## 9. Data model

```mermaid
erDiagram
    users ||--o{ user_room_access : "allowed rooms"
    rooms ||--o{ user_room_access : ""
    rooms ||--o{ devices : contains
    integration_accounts ||--o{ devices : "linked via"
    integration_accounts ||--o{ discovered_devices : "found via"
    devices ||--o{ device_group_members : ""
    device_groups ||--o{ device_group_members : ""
    devices ||--o{ energy_metrics : samples
    users { text id PK; text role; bool all_rooms }
    devices { text id PK; text integration_type; text external_id; text state_json; text secrets_enc; bool is_online }
    discovered_devices { text id PK; text status; text note; text secrets_enc }
    integration_accounts { text id PK; text credentials_enc; text status }
    energy_metrics { text device_id; real power_watts; real energy_kwh; datetime recorded_at }
    automations { text triggers_json; text conditions_json; text actions_json; bool is_enabled }
    scenes { text actions_json }
    electricity_settings { real rate_per_kwh; text currency; real monthly_budget; int billing_cycle_day; real fixed_monthly_charge }
    notifications { text level; text title; bool is_read }
    app_settings { text key PK; text value_json }
```

Migrations live in `migrations/` and run at startup (`sqlx::migrate!`).
