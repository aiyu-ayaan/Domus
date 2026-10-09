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

## Next
- [ ] Verify against real hardware: Tuya account (QR), Tapo P110 + L900 found on LAN, Xiaomi device at 192.168.1.7
- [ ] Tuya local control (protocol 3.3/3.4/3.5) using stored local keys, cloud as fallback
- [ ] Tuya realtime MQTT push instead of polling
- [ ] Tapo: hub child devices, light-strip colours
- [ ] Xiaomi: legacy (non-MIoT) devices, 2FA flow in UI
- [ ] MQTT integration (Home Assistant MQTT discovery, Zigbee2MQTT)
- [ ] Per-device energy tariffs / time-of-use rates
- [ ] Packaged Electron builds; Docker image for the home server
- [ ] Native Android app (out of scope for now)
