<img src="design-system/domus/brand/app-icon.svg" alt="Domus logo" width="72" />

# Domus

[![Release](https://img.shields.io/github/actions/workflow/status/aiyu-ayaan/Domus-Rust/release.yml?branch=master&label=release&logo=githubactions&logoColor=white)](https://github.com/aiyu-ayaan/Domus-Rust/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/aiyu-ayaan/Domus-Rust?include_prereleases&label=version&logo=github)](https://github.com/aiyu-ayaan/Domus-Rust/releases)
[![License: MIT](https://img.shields.io/github/license/aiyu-ayaan/Domus-Rust)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/aiyu-ayaan/Domus-Rust/master)](https://github.com/aiyu-ayaan/Domus-Rust/commits/master)
[![Docker pulls](https://img.shields.io/docker/pulls/aiyuayaan/domus?logo=docker&logoColor=white)](https://hub.docker.com/r/aiyuayaan/domus)
[![Docker image size](https://img.shields.io/docker/image-size/aiyuayaan/domus/latest?logo=docker&logoColor=white)](https://hub.docker.com/r/aiyuayaan/domus)

![Rust](https://img.shields.io/badge/backend-Rust-000000?logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/database-SQLite-003B57?logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/web-React%20%2B%20TypeScript-149ECA?logo=react&logoColor=white)
![Electron](https://img.shields.io/badge/desktop-Electron-47848F?logo=electron&logoColor=white)
![Android](https://img.shields.io/badge/android-Kotlin%20%2B%20Compose-3DDC84?logo=android&logoColor=white)
![MQTT](https://img.shields.io/badge/MQTT-Home%20Assistant%20discovery-660066?logo=mqtt&logoColor=white)
![Platforms](https://img.shields.io/badge/platforms-Web%20%7C%20Linux%20%7C%20Windows%20%7C%20Android-informational)
![Languages](https://img.shields.io/badge/languages-27-blue?logo=googletranslate&logoColor=white)
![Encrypted](https://img.shields.io/badge/HTTPS-by%20default-success?logo=letsencrypt&logoColor=white)

A local-first smart-home hub for your home server. Rust backend, SQLite,
React web UI (with an Electron desktop shell), and pluggable integrations for
**Tuya / Smart Life** (QR-code login, no developer account), **TP-Link Tapo**
(local), **Xiaomi Mi Home** (local, tokens from your Mi account), **Philips Hue**
(local bridge) and **MQTT** (Zigbee2MQTT, ESPHome and anything else that speaks
Home Assistant discovery).

- Automatic discovery of new devices, with an inbox or auto-add
- Live dashboard: power draw, bill so far and projected bill, air quality, motion / door / leak / battery readings
- Rooms, device groups, scenes and automations; triggers at a time, at **sunrise or sunset** (with an offset), on a device change, power level or going offline
- **Ask before switching**: mark a main switch and every app, group, scene and manual automation run warns before it is turned on or off
- Electricity billing with flat, slab and **time-of-day** tariffs in any currency
- Multiple users with admin / member / guest roles and access per room or per device, each see-only, control or edit
- Web, Electron desktop (Linux, Windows) and a native Android app, kept in sync live
- **27 languages** in the web, desktop and Android apps, following your system's language with a picker in Settings; right to left for Arabic and Urdu
- An Updates page with the release notes (Markdown, tables and images) in every app
- HTTPS by default; credentials and device keys encrypted at rest; one-file backup and restore

Architecture and diagrams: [`development/docs/ARCHITECTURE.md`](development/docs/ARCHITECTURE.md), summarised [below](#how-it-fits-together).
UI design profile: [`design-system/domus/MASTER.md`](design-system/domus/MASTER.md).
Progress: [`development/TODO.md`](development/TODO.md).

## How it fits together

```mermaid
flowchart LR
    subgraph Clients
        Web["React web UI"]
        Desk["Electron desktop"]
        And["Android app<br/>(Kotlin, Compose)"]
    end

    subgraph Server["Domus server: Rust (Axum, Tokio), one binary or Docker image"]
        direction TB
        TLS["HTTPS (rustls)"] --> Auth["JWT auth<br/>role and access read from the database"]
        Auth --> Modules["modules<br/>users · devices · rooms · scenes · automations<br/>energy · notifications · integrations"]
        Auth --> WS["live events (WebSocket)"]
        Modules --> Mgr["DeviceManager<br/>poll · discover · command"]
        Mgr --> Bus(("EventBus"))
        Bus --> Engine["AutomationEngine<br/>time · sun · state triggers"]
        Engine --> Mgr
        Bus --> WS
        Workers["workers<br/>poller · discovery · scheduler"] --> Mgr
        Workers --> Engine
        Mgr --> Vault["Vault<br/>AES-256-GCM"]
    end

    subgraph Plugins["integrations"]
        Tuya["Tuya / Smart Life<br/>cloud, QR login"]
        Tapo["Tapo<br/>local"]
        Xiaomi["Xiaomi<br/>local miIO"]
        Hue["Philips Hue<br/>local bridge"]
        Mqtt["MQTT<br/>Home Assistant discovery"]
    end

    DB[("SQLite<br/>data/domus.db")]
    Keys[["data/master.key · jwt.secret · tls/"]]
    Web & Desk & And -->|"HTTPS + WSS"| TLS
    Mgr --> Plugins
    Modules --> DB
    Vault -.-> Keys
    Modules -. "place search (name only)" .-> Geo(("Open-Meteo<br/>geocoding"))
```

Clients talk only to the server; the server talks to your devices (locally where the vendor allows it)
and keeps everything in one SQLite file. The cloud is used only where a vendor offers no local control
(Tuya) or to fetch device keys (Xiaomi), plus two optional lookups: place search for the home location and
GitHub for update checks.

### Data model

```mermaid
erDiagram
    users ||--o{ user_room_access : "rooms"
    rooms ||--o{ user_room_access : ""
    users ||--o{ user_device_access : "devices"
    devices ||--o{ user_device_access : ""
    rooms ||--o{ devices : contains
    integration_accounts ||--o{ devices : "linked via"
    integration_accounts ||--o{ discovered_devices : "found via"
    devices ||--o{ device_group_members : ""
    device_groups ||--o{ device_group_members : ""
    devices ||--o{ energy_metrics : samples
    devices ||--o{ air_metrics : samples
    users {
        text id PK
        text role
        bool all_rooms
        bool kid
        bool must_change_password
        text reset_code_hash
    }
    user_room_access {
        text user_id
        text room_id
        bool can_control
        bool can_edit
    }
    user_device_access {
        text user_id
        text device_id
        bool can_control
        bool can_edit
    }
    devices {
        text id PK
        text integration_type
        text state_json
        text secrets_enc
        bool is_online
        bool confirm_changes
    }
    discovered_devices {
        text id PK
        text status
        text secrets_enc
    }
    integration_accounts {
        text id PK
        text credentials_enc
        text status
    }
    energy_metrics {
        text device_id
        real power_watts
        real energy_kwh
        datetime recorded_at
    }
    air_metrics {
        text device_id
        real pm25
        datetime recorded_at
    }
    automations {
        text triggers_json
        text conditions_json
        text actions_json
        bool is_enabled
    }
    scenes {
        text actions_json
        text kind
    }
    electricity_settings {
        real rate_per_kwh
        text currency
        text slabs
        text time_of_use
    }
    notifications {
        text level
        text title
        bool is_read
        bool admin_only
    }
    app_settings {
        text key PK
        text value_json
    }
```

Credentials and device keys are stored sealed (`*_enc`) under `data/master.key`, which is not in the
database. The full set of diagrams, one per feature, is in
[`development/docs`](development/docs).

## Screenshots

<p align="center"><img src="res/domus.gif" alt="Domus walkthrough" width="270" /></p>

**Desktop** (Electron and web)

<p>
  <img src="res/screenshots/desktop-dark-overview.png" width="49%" />
  <img src="res/screenshots/desktop-light-overview.png" width="49%" />
  <img src="res/screenshots/desktop-dark-energy.png" width="49%" />
  <img src="res/screenshots/desktop-dark-air-quality.png" width="49%" />
  <img src="res/screenshots/desktop-dark-devices.png" width="49%" />
  <img src="res/screenshots/desktop-dark-automations.png" width="49%" />
</p>

**Android**

<p>
  <img src="res/screenshots/android-home.png" width="19%" />
  <img src="res/screenshots/android-devices.png" width="19%" />
  <img src="res/screenshots/android-energy.png" width="19%" />
  <img src="res/screenshots/android-scenes.png" width="19%" />
  <img src="res/screenshots/android-settings.png" width="19%" />
</p>

**Mobile web**

<p>
  <img src="res/screenshots/mobile-dark-overview.png" width="19%" />
  <img src="res/screenshots/mobile-dark-devices.png" width="19%" />
  <img src="res/screenshots/mobile-dark-energy.png" width="19%" />
  <img src="res/screenshots/mobile-light-overview.png" width="19%" />
  <img src="res/screenshots/mobile-dark-rooms.png" width="19%" />
</p>

All captures are in [`res/screenshots`](res/screenshots); the full-quality walkthrough is [`res/domus.mp4`](res/domus.mp4).

## Download

| | |
|---|---|
| Server (Docker) | `aiyuayaan/domus` on Docker Hub, amd64 and arm64 |
| Android | `Domus-<version>.apk` from the [latest release](https://github.com/aiyu-ayaan/Domus-Rust/releases) |
| Linux desktop | the one-line installer below, or the `.deb` / `.AppImage` from the release |
| Windows desktop | `Domus-<version>-Setup.exe` from the release |

### Server

One file is all the host needs:

```bash
mkdir domus && cd domus
wget https://raw.githubusercontent.com/aiyu-ayaan/Domus-Rust/master/docker-compose.yml
docker compose up -d
```

Open `https://<server-ip>:8443` and create the administrator account. `docker compose logs domus`
shows the certificate fingerprint the apps ask you to confirm.

```bash
docker compose pull && docker compose up -d      # update
DOMUS_VERSION=beta docker compose up -d          # follow a channel: latest (default), beta, alpha, or 0.0.1
TZ=Asia/Kolkata DOMUS_PORT=9443 docker compose up -d
docker compose --profile mqtt up -d              # also start the optional Mosquitto broker
```

Put `DOMUS_VERSION`, `TZ` and `DOMUS_PORT` in a `.env` file next to the compose file to keep them.

### Linux desktop app

Installs the newest release for the current user (x86_64, no root): the AppImage, a menu entry with
the Domus icon and a `domus` command. The app then keeps itself up to date.

```bash
curl -fsSL https://raw.githubusercontent.com/aiyu-ayaan/Domus-Rust/master/scripts/install-linux.sh | sh
# ... | sh -s -- --channel beta     beta builds too (or alpha)
# ... | sh -s -- --uninstall        remove it; settings are kept
```

### Android

Download the APK from the release page and open it. Later updates are offered when the app opens and in
Settings → Updates, on the Stable, Beta or Alpha channel, and installed from there; Android asks
once to allow Domus to install them.

The **Updates** page (Settings → Updates on Android, Settings → About → Updates on web and desktop) shows
what you run, the newest release on your channel and its release notes, which are written in Markdown.

Releases, version numbers and the update channels: [development/docs/RELEASE.md](development/docs/RELEASE.md).

## Requirements

- Rust 1.80+ (`cargo`)
- Node.js 18+ and `pnpm`

## Run in development

```bash
pnpm install
npm run dev            # backend (https://127.0.0.1:8443) + web (http://localhost:3000)

npm run dev:backend    # backend only
npm run dev:web        # web only (proxies /api to the backend)
npm run dev:desktop    # Electron; pick the server on its connect page
```

Open http://localhost:3000. The first visit asks you to create the
administrator account.

## Run on the home server

```bash
pnpm build:web                     # builds apps/web/dist, served by the backend
APP_ENV=production cargo run --release --manifest-path backend/Cargo.toml
```

Then open `https://<server-ip>:8443`.

Or build the Docker image from this checkout (host networking, data in the `domus_data` volume):

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Remote access through a Cloudflare Tunnel, the home/remote address the apps switch between, and the
desktop packages (`pnpm build:desktop`) are described in
[development/docs/DEPLOYMENT.md](development/docs/DEPLOYMENT.md).

On first start Domus creates `data/` with:

| File | Purpose |
|---|---|
| `domus.db` | SQLite database |
| `master.key` | encrypts integration credentials and device keys — **back it up** |
| `jwt.secret` | signs sessions |
| `tls/` | self-signed certificate (replace via `tls.cert_path` / `tls.key_path`) |

Settings live in `config/default.toml`; any key can be overridden with
`DOMUS__SECTION__KEY` environment variables (see `.env.example`).

## Backup and restore

Everything lives in `data/`. Back up the whole folder, or take the one-file backup:

**Back up.** Sign in as an administrator → Settings → **Backup** → *Download backup*. The file is a copy of the
database with the master key stored inside, so the linked accounts in it can still be opened after a restore.
It is made while the server runs. Keep it private: whoever holds it can open those accounts. The JWT secret
and the TLS certificate are not in it.

**Restore.** Stop the server, then:

```bash
# Docker
docker compose cp domus-backup-2026-10-11.db domus:/app/data/restore.db
docker compose stop domus
docker compose run --rm domus domus-backend restore data/restore.db
docker compose start domus

# Without Docker, from the repo root (uses ./data)
domus-backend restore ~/Downloads/domus-backup-2026-10-11.db
```

What was there is kept next to it as `*.before-restore`. After a restore on a new machine people sign in
again and the apps ask to trust the new certificate. If you set the key with `DOMUS_MASTER_KEY`, the backup
holds no key and the restored server needs the same variable. More in
[development/docs/DEPLOYMENT.md](development/docs/DEPLOYMENT.md#backup-and-restore).

## Forgot the administrator password

Domus has no mail server, so nothing is sent by email. In order of effort:

1. **Another administrator** opens Settings → People, turns on *Reset code* for you and tells you the 8-digit
   code (good for 30 minutes and 5 wrong tries). On the sign-in screen choose *Forgot password?*, enter your
   username and then the code.
2. **From the server**, which works while Domus runs or is stopped and needs no sign-in:

   ```bash
   docker compose exec domus domus-backend reset-password <username>              # prints a new random password
   docker compose exec domus domus-backend reset-password <username> 'new-pass'   # or choose one (8+ characters)
   domus-backend reset-password <username>                                        # without Docker, from the repo root
   ```

   Sign in with it and change it in Settings → Password.

Five wrong passwords for a username lock that name for 15 minutes in production (the lock is lifted by
restarting the server, and is off in development). Details and the rules for generated passwords and kid's
accounts: [development/docs/ACCOUNTS.md](development/docs/ACCOUNTS.md).

## Languages

English, Hindi, Spanish, Portuguese (Brazil), Indonesian, Arabic, French, Russian, German, Turkish, Japanese, Korean,
Italian, Vietnamese, Thai, Chinese (Simplified and Traditional), Polish, Bengali, Tamil, Telugu, Marathi, Gujarati,
Kannada, Malayalam, Punjabi and Urdu. Arabic and Urdu are laid out right to left.

Each app follows the language of your browser or system, and shows English when it has no translation for it. To choose
another one, open Settings > Language (Appearance on web and desktop); *System default* goes back to following the system.
On Android 13 and later it also appears under the phone's Settings > Apps > Domus > Language.

The translations are machine-made and have not been reviewed by native speakers, so wording may be off. A fix is a one-line
change in the language's catalog. How the languages work, how to add one and the rules for new text:
[development/docs/LOCALIZATION.md](development/docs/LOCALIZATION.md).

## Connecting devices

| Brand | How |
|---|---|
| Tuya / Smart Life | Integrations → *Link with QR code*. Enter the **User Code** from Smart Life (Me → Settings → Account and Security → User Code), then scan the QR in the app. |
| Tapo | Integrations → *Link account* with your TP-Link ID. Devices on the LAN are found automatically and controlled locally. An H100 hub brings its sensors, switches and thermostats with it. Cameras are listed but not supported yet. |
| Xiaomi | Integrations → *Link account* with your Mi account and server region. If Xiaomi asks for two-step verification, enter the code it emails or texts you in the same panel. The account can be an email, a phone number with country code (`+91…`) or a Xiaomi ID. Tokens are fetched once; control is local. Devices can also be added with a token. |
| Philips Hue | Press the round button on the bridge, then Integrations → Philips Hue → *Link* within 30 seconds. Leave the address empty to find the bridge automatically. Lights and Hue smart plugs are controlled locally. |
| MQTT | Integrations → MQTT → *Link* with your broker's address, port and login. Devices that announce themselves through Home Assistant MQTT discovery (Zigbee2MQTT, ESPHome, …) appear under Discovered: lights, switches, plugs, fans and sensors. With the bundled broker (`--profile mqtt`) the address is `mqtt`, port `1883`. |

See `development/docs/INTEGRATIONS.md` for what each integration covers.

## Electricity billing

Energy → *Electricity plan*: pick any currency, and choose a flat price per
kWh or **slabs** for unit-based tariffs (e.g. Pune/MSEDCL: 0–100 units at one
rate, 101–300 at the next, and so on). The bill is calculated per billing
cycle, plus the fixed monthly charge.

Tariffs can also carry **time-of-day** windows: hours (on the home's clock, past midnight allowed) whose
units cost a set amount more or less, for example a night rebate or a peak surcharge, on top of the flat or
slab price.

New devices appear under **Devices → Discovered**. Turn on *Add new devices
automatically* there to skip the inbox.

## Sunrise and sunset

Set where the home is in Settings → **Home location**: use this phone's or browser's location, search for
the town (the server asks the free Open-Meteo geocoder; only the name you type leaves the home), or type the
latitude and longitude. The coordinates are rounded to about a kilometre and stay on your server. An
automation can then run at sunrise or sunset, minutes before or after. Without a location, a sun trigger
never fires.

## Ask before switching

A main switch that cuts power to everything plugged into it is easy to turn off by mistake. Open the device
and turn on **Ask before switching**: every app then asks before turning it on or off, and so do room
*All on / All off*, device groups, scenes (including scenes inside scenes) and a manual *Run* of an
automation that would switch it. The setting is kept on the server, so it is the same on web, desktop and
Android. Automations that fire on their own cannot ask and run as written, and nothing outside Domus (a
vendor app, a wall switch) is covered.

## License

Domus is released under the [MIT License](LICENSE). Third-party libraries keep their own licenses; they are
listed under About → Acknowledgements in every app.

## Tests

```bash
cargo test --workspace
pnpm --filter @domus/web exec tsc -b
```
