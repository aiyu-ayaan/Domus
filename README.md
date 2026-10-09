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
npm run dev:desktop    # Electron, loads http://localhost:3000
```

Open http://localhost:3000. The first visit asks you to create the
administrator account. Development mode enables simulated **demo devices** so
you can try everything without hardware (`config/development.toml`).

## Run on the home server

```bash
pnpm build:web                     # builds apps/web/dist, served by the backend
APP_ENV=production cargo run --release --manifest-path backend/Cargo.toml
```

Then open `https://<server-ip>:8443`. Desktop: `DOCUS_URL=https://<server-ip>:8443 pnpm dev:desktop`.

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
| Tuya / Smart Life | Plugins → *Scan QR to link*. Enter the **User Code** from Smart Life (Me → Settings → Account and Security → User Code), then scan the QR in the app. |
| Tapo | Plugins → *Link account* with your TP-Link ID. Devices on the LAN are found automatically and controlled locally. |
| Xiaomi | Plugins → *Link account* with your Mi account and server region. Tokens are fetched once; control is local. Devices can also be added with a token. |

New devices appear under **Devices → Discovered**. Turn on *Add new devices
automatically* there to skip the inbox.

## Tests

```bash
cargo test --workspace
pnpm --filter @docus/web exec tsc -b
```
