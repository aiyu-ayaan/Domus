<img src="design-system/docus/brand/app-icon.svg" alt="Docus logo" width="72" />

# Docus

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
UI design profile: [`design-system/docus/MASTER.md`](design-system/docus/MASTER.md).
Progress: [`development/TODO.md`](development/TODO.md).

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

Or with Docker (host networking, data in the `docus_data` volume):

```bash
docker compose up -d --build
```

Remote access through a Cloudflare Tunnel, the home/remote address the apps switch between, and the
desktop packages (`pnpm build:desktop`) are described in
[development/docs/DEPLOYMENT.md](development/docs/DEPLOYMENT.md).

On first start Docus creates `data/` with:

| File | Purpose |
|---|---|
| `docus.db` | SQLite database |
| `master.key` | encrypts integration credentials and device keys — **back it up** |
| `jwt.secret` | signs sessions |
| `tls/` | self-signed certificate (replace via `tls.cert_path` / `tls.key_path`) |

Settings live in `config/default.toml`; any key can be overridden with
`DOCUS__SECTION__KEY` environment variables (see `.env.example`).

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
pnpm --filter @docus/web exec tsc -b
```
