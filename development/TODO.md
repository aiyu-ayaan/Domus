# Docus Project Tracking & Task Plan

## Milestone 1: Workspace & Core Scaffolding (DONE)
- [x] Rust workspace (`crates/home-core`, `backend`), pnpm workspace (`apps/web`, `apps/desktop`)
- [x] Initial schema, module layout, Electron shell

## Milestone 2: Working backend & integrations (DONE — 2026-10-09)
- [x] Shared plugin contract in `home-core` (`IntegrationPlugin`, `DeviceCommand`, `DiscoveredDevice`)
- [x] `DeviceManager`: batched polling, offline detection, optimistic commands, energy sampling
- [x] Discovery inbox: adopt / ignore / restore, manual add by IP
- [x] Automatic discovery worker (interval, auto-add, notifications — configurable in UI)
- [x] Tuya / Smart Life via QR login (Home Assistant flow), signed + AES-GCM API, DP spec mapping
- [x] Tapo local KLAP v1/v2 + UDP discovery, P110 energy
- [x] Xiaomi: Mi cloud login (token fetch), miIO local protocol, MIoT spec mapping
- [x] WebSocket live events (room-filtered)
- [x] Users, roles (admin/member/guest), per-room access; first-run setup lock
- [x] Device groups, scenes, edge-triggered automations (time/state/power/offline/discovery)
- [x] Energy: billing cycle, fixed charge, budget, projection, history, per-device breakdown
- [x] Notifications center

## Milestone 3: Security (DONE for MVP)
- [x] HTTPS by default (self-signed generated, custom cert supported)
- [x] AES-256-GCM vault for credentials and device secrets; master key outside DB
- [x] Generated JWT secret; role checks against DB per request
- [ ] Login rate limiting per IP (currently a fixed delay on failure)
- [ ] Optional SQLCipher full-database encryption
- [ ] Vite dev server over HTTPS (dev only; production is already HTTPS)

## Milestone 4: UI (DONE — 2026-10-09)
- [x] First pass (liquid glass) rejected as too cartoonish
- [x] Persisted design profile `design-system/docus/MASTER.md` (Minimalism & Swiss via ui-ux-pro-max)
- [x] Rebuilt every screen on the profile: Overview, Devices/Discovered/Groups, Rooms, Automations & Scenes, Energy, Integrations, Settings
- [x] Demo/virtual devices removed
- [ ] Check phone layout on a real device (375px)

## Milestone 5: Fixes and billing (DONE — 2026-10-09)
- [x] Tapo: title-case HTTP headers fix `400 Bad Request` on KLAP handshake
- [x] Xiaomi: email/SMS two-step verification in the link sheet, trusted device id, phone-number login
- [x] Energy: any ISO currency, slab (per-units) tariffs for Pune/MSEDCL-style billing
- [x] Live UI: device add/update/remove refreshes rooms, groups, energy and integrations; "Power now" computed from live devices
- [x] Sheet inputs no longer lose focus on every keystroke
- [x] Local devices polled every 3 s (cloud every 15 s) so power readings feel live
- [ ] Verify Xiaomi 2FA end to end with a real account (SMS path unconfirmed)
- [ ] Time-of-use tariffs (per-hour rates) on top of slabs

## Milestone 6: Lighting & Bulb Color Control (DONE — 2026-10-10)
- [x] Shared domain model: `color` (hex #RRGGBB) and `color_mode` ("white" / "color") in `DeviceState` and `DeviceCommand`
- [x] Color conversion utilities (hex <-> rgb <-> hsv <-> kelvin <-> int) with test suite in `home-core`
- [x] Tapo integration: color mode (hue 0-360, saturation 0-100) and white mode (2500K-6500K) commands and status mapping
- [x] Tuya integration: `colour_data_v2`, `colour_data_hsv`, `colour_data` DP encoding/decoding and `work_mode` switching
- [x] Xiaomi MIoT: `color` prop integer conversion, state decoding and command encoding
- [x] Liquid glass UI (`LightColorControls.tsx`): White mode with blackbody Kelvin temperature gradient and presets (Candle, Soft White, Daylight, Cool White); Color mode with curated swatches and interactive color wheel/picker; Apple liquid glass radiance glow orb indicator
- [x] Automations support: setting light color and temperature in `RuleEditor`

## Milestone 7: Dynamic Overview Dashboard & Air Quality Tab (DONE — 2026-10-10)
- [x] Dynamic hero metrics: conditionally render Power, Today, and Bill metrics only when electronic power-measuring devices exist; render Air Quality metric only when air purifiers / PM2.5 sensors exist; auto-scaling grid columns
- [x] Dedicated Air Quality view (`/air-quality`, `AirQualityView.tsx`): full-screen air analytics mirroring `/energy`, with live PM2.5 gauge, air purifier controls, HEPA filter life, and sensor matrices
- [x] Dynamic app navigation (`AppShell.tsx`): sidebar and mobile tab bar dynamically display `Air quality` and `Energy` tabs only when matching devices have been added
- [x] Direct Overview insights cards (`OverviewInsights.tsx`): prominent Air Quality Card and Energy Card visible immediately on overview, auto-hidden when devices are absent
- [x] Air quality monitoring & controls: live PM2.5 gauge with WHO 4-segment visual indicator, interactive air purifier control cards (power switch, mode, fan speed, HEPA filter life bar)
- [x] Dynamic category filtering in Devices card: `All`, `Power`, `Lights`, `Air quality`, and `Climate` pills that only show when matching devices exist
- [x] Scene & group one-touch toggling: backend endpoints `/scenes/:id/toggle` and `/scenes/:id/deactivate`, front-end scene toggle switches in Automations & Overview, and segmented device groups quick toggle on the Overview dashboard

## Next
- [ ] Verify against real hardware: Tuya account (QR), Tapo P110 + L900 found on LAN, Xiaomi device at 192.168.1.7
- [ ] Tuya local control (protocol 3.3/3.4/3.5) using stored local keys, cloud as fallback
- [ ] Tuya realtime MQTT push instead of polling
- [ ] Tapo: hub child devices
- [ ] Xiaomi: legacy (non-MIoT) devices
- [ ] MQTT integration (Home Assistant MQTT discovery, Zigbee2MQTT)
- [ ] Per-device energy tariffs / time-of-use rates
- [ ] Packaged Electron builds; Docker image for the home server
- [ ] Native Android app (out of scope for now)

