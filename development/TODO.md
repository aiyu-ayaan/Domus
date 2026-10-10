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

## Milestone 8: Screen Sync & Dynamic Ambilight (DONE — 2026-10-10)
- [x] Client capture pipeline: `getDisplayMedia` / `desktopCapturer` support in Web and Electron
- [x] Background frame analysis worker (`screenSync.worker.ts`): zero-copy `MediaStreamTrackProcessor` (Chromium/Electron) with fallback HTML `<video>` canvas pump (Firefox/Safari)
- [x] Real-time color extraction (`colorAnalysis.ts`): Vivid (36-bin hue histogram with saturation-squared weighting and 1.2x boost), Dominant (4,096-bin RGB mode), and Average modes
- [x] Screen region selection: full screen vs edges band (20% perimeter margin for TV ambilight bias lighting)
- [x] Cut-aware exponential smoothing (`Smoother`): non-linear color-distance dynamic step scaling for flicker-free drift and instant scene cut transitions
- [x] Dynamic brightness following: gamma curve luminance follower ($L^{0.75}$) clamped within user-defined min/max bounds
- [x] Streaming backend (`screen_sync.rs`): WebSocket `/api/v1/scenes/:id/sync` with per-device `watch` channels for zero-queue latest-frame-wins delivery
- [x] Heterogeneous transport pacing: local LAN devices (Tapo KLAP & Xiaomi) at 150ms (~7 Hz) vs cloud devices (Tuya) at 1200ms (~1 Hz) with frame deduplication and adaptive backoff
- [x] State preservation & restoration: pre-sync snapshotting with automatic restoration or final-color commitment on session teardown
- [x] Global live session UI (`ScreenSyncProvider` & `ScreenSyncPill`): floating pill indicator with live color orb, device counters, and lag alerts
- [x] Overview Quick Controls integration (`OverviewView.tsx`): Screen Sync scene badges, target light count resolution, live pulsing status, one-touch Sync/Stop, and remote session deactivation
- [x] Architecture documentation: comprehensive specification and sequence/state diagrams in `development/docs/SCREEN_SYNC.md`

## Milestone 9: Native Android app (DONE — 2026-10-10)
- [x] Gradle project `apps/android`, package `com.aiyu.domus`, modules `app`, `core`, `ui-shared`
- [x] Server discovery: backend UDP beacon (`infrastructure/beacon.rs`, port 48443) + `ServerDiscovery` broadcast scan
- [x] Custom server URL (hosted servers), https only; trust-on-first-use pinning for the self-signed certificate; fingerprint logged by the server
- [x] Session, pin and token encrypted with an Android Keystore key
- [x] Material 3 Expressive theme and motion; Rewire floating pill navigation (rail on wide windows)
- [x] Screens: connect, admin setup / sign in, Home dashboard, Devices by room with control sheet, Scenes & automations, Energy with history, Settings
- [x] Live updates over the WebSocket, optimistic commands with rollback
- [x] Verified on an emulator (debug and minified release) against a local server
- [x] Docs: `development/docs/ANDROID_APP.md`

## Milestone 10: Android parity, analytics and dev tooling (2026-10-10)
- [x] Android onboarding: Plugins (Tuya QR, Tapo, Xiaomi + verification code), Add devices (scan, adopt, ignore, add by address), synced with the web through the event stream
- [x] Android management: rooms, people (roles, room access), electricity tariff with slabs, notification inbox, device rename / move / remove
- [x] Android scene and automation editors (JSON-preserving), Screen Sync from the phone screen (MediaProjection), free color wheel
- [x] Android alerts while closed (opt-in foreground service) with boot restart
- [x] Android first-run introduction, redesigned connect / sign-in, Home with scene cards, rooms and recent activity
- [x] Analytics tab on Android (Electricity + Air quality, dynamic), charts with selectable buckets
- [x] Backend: `air_metrics` history + `GET /air/history`; web: air quality trend chart, insights on Energy and Air Quality
- [x] `pnpm gateway` (LAN + adb forwarding for the dev server, started by `pnpm dev`) and `pnpm android:dev`
- [x] Light moods and on-device effects (catalog in `home-core`, Tuya scene mode, Tapo strip lighting effects), web + Android; one effect verified on a Tuya bulb and the Tapo L900
- [ ] Light effects: tune Tuya step timing by eye, Xiaomi support, brightness while an effect plays on a Tapo strip
- [ ] Verify on hardware: Screen Sync capture, alerts service, Tuya QR link from the phone, real-phone LAN discovery
- [x] Logo: modular D mark on the favicon, PWA icons, desktop window, Android launcher and animated splash (`development/docs/BRAND.md`)

## Milestone 11: Docker, remote access and the desktop app (2026-10-10)
- [x] Server image (`Dockerfile`) and compose service on the host network; MQTT broker behind the `mqtt` profile
- [x] `GET/PUT /server/links`: home and remote address plus the certificate fingerprint
- [x] Web: Server addresses card in Settings
- [x] Android: home address at home, remote elsewhere, one session; Server addresses page
- [x] Desktop: connect page with LAN scan, home/remote switching, shared session token, certificate pinning, in-page title bar (no native bar or menu)
- [x] Desktop on Linux: `pnpm dev:desktop` runs (`--no-sandbox`), `pnpm build:desktop` builds the `.deb` and AppImage with the icon
- [x] Docs: `development/docs/DEPLOYMENT.md`
- [ ] Run against a real Cloudflare Tunnel
- [ ] Install the `.deb` and check the launcher icon; test Android switching on a phone that leaves the Wi-Fi

## Milestone 12: Light theme, Theme toggle, and Auto-collapsing sidebar (DONE — 2026-10-10)
- [x] Web reactive theme store (`apps/web/src/lib/theme.ts`) with `useSyncExternalStore`, OS media query listener, and cross-tab storage sync
- [x] Reusable `ThemeToggle` component with Sun/Moon/CircleHalfTilt Phosphor icons cycling across Auto (system), Light, and Dark modes
- [x] Light & dark tokens in `apps/web/src/index.css` aligned to Android Material 3 botanical scheme (`#12140E` dark, `#F9FAEF` light, with `#354E16`/`#CDEDA3` active container pills)
- [x] Compact vertically centered floating pill dock in `AppShell.tsx`: `rounded-[32px]`, `top-1/2 -translate-y-1/2`, `h-auto` compact height, 72px pill rail when idle, smooth 200ms debounced hover-to-expand to 240px with zero-reflow layout stability
- [x] Collapsed rail indicators: Android Material 3 horizontal pill capsules (`w-14 h-8 rounded-full`), badge indicator dots for unread notifications and pending devices, uniform vertical spacing, and stacked footer
- [x] Theme-matched sleek scrollbars in `index.css`: replaced native OS/browser scrollbars with transparent-track floating pill thumbs, removing stepper arrow buttons
- [x] Mobile navigation parity: theme toggle in sticky header and in the 'More' sheet
- [x] Android theme preserved as original Material 3 Expressive botanical palette in `apps/android/ui-shared/src/main/java/com/aiyu/domus/ui/theme/Color.kt`
- [x] Architecture documentation with Mermaid diagrams in `development/docs/THEME_AND_NAVIGATION.md`

## Next
- [ ] Android: verify LAN discovery and controls on a real phone with real devices
- [ ] Android: integration linking, device adoption, scene/automation editors, tariff settings, push notifications
- [ ] Verify against real hardware: Tuya account (QR), Tapo P110 + L900 found on LAN, Xiaomi device at 192.168.1.7
- [ ] Tuya local control (protocol 3.3/3.4/3.5) using stored local keys, cloud as fallback
- [ ] Tuya realtime MQTT push instead of polling
- [ ] Tapo: hub child devices
- [ ] Xiaomi: legacy (non-MIoT) devices
- [ ] MQTT integration (Home Assistant MQTT discovery, Zigbee2MQTT)
- [ ] Per-device energy tariffs / time-of-use rates
- [ ] Packaged Electron builds for macOS and Windows


