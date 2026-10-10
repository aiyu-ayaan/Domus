<img src="design-system/domus/brand/app-icon.svg" alt="Domus logo" width="72" />

# Domus

A local-first smart-home hub for your home server. Rust backend, SQLite,
React web UI (with an Electron desktop shell), and pluggable integrations for
**Tuya / Smart Life** (QR-code login, no developer account), **TP-Link Tapo**
(local) and **Xiaomi Mi Home** (local, tokens from your Mi account).

- Automatic discovery of new devices, with an inbox or auto-add
- Live dashboard: power draw, bill so far and projected bill, air quality
- Rooms, device groups, scenes and automations
- Multiple users with admin / member / guest roles and per-room access
- HTTPS by default; credentials and device keys encrypted at rest

Architecture and diagrams: [`development/docs/ARCHITECTURE.md`](development/docs/ARCHITECTURE.md).
UI design profile: [`design-system/domus/MASTER.md`](design-system/domus/MASTER.md).
Progress: [`development/TODO.md`](development/TODO.md).

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

Download the APK from the release page and open it. Later updates are offered in
Settings → Updates, on the Stable, Beta or Alpha channel, and installed from there; Android asks
once to allow Domus to install them.

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

## Connecting devices

| Brand | How |
|---|---|
| Tuya / Smart Life | Integrations → *Link with QR code*. Enter the **User Code** from Smart Life (Me → Settings → Account and Security → User Code), then scan the QR in the app. |
| Tapo | Integrations → *Link account* with your TP-Link ID. Devices on the LAN are found automatically and controlled locally. |
| Xiaomi | Integrations → *Link account* with your Mi account and server region. If Xiaomi asks for two-step verification, enter the code it emails or texts you in the same panel. The account can be an email, a phone number with country code (`+91…`) or a Xiaomi ID. Tokens are fetched once; control is local. Devices can also be added with a token. |

## Electricity billing

Energy → *Electricity plan*: pick any currency, and choose a flat price per
kWh or **slabs** for unit-based tariffs (e.g. Pune/MSEDCL: 0–100 units at one
rate, 101–300 at the next, and so on). The bill is calculated per billing
cycle, plus the fixed monthly charge.

New devices appear under **Devices → Discovered**. Turn on *Add new devices
automatically* there to skip the inbox.

## Tests

```bash
cargo test --workspace
pnpm --filter @domus/web exec tsc -b
```
