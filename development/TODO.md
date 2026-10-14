# Domus Project Tracking & Task Plan

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
- [x] Login lockout per username: 5 wrong passwords lock the name for 15 minutes (`LoginThrottle`, in memory)
- [ ] Optional SQLCipher full-database encryption
- [ ] Vite dev server over HTTPS (dev only; production is already HTTPS)

## Milestone 4: UI (DONE — 2026-10-09)
- [x] First pass (liquid glass) rejected as too cartoonish
- [x] Persisted design profile `design-system/domus/MASTER.md` (Minimalism & Swiss via ui-ux-pro-max)
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
- [x] Time-of-use tariffs: windows of the day with an amount per unit on top of the flat or slab rate (`0011_time_of_use.sql`), web and Android editors

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
- [x] Dynamic theming (wallpaper colors on Android 12+) disabled by default; cleanly toggleable in Settings Appearance
- [x] Material 3 Expressive Collapsible Card (`CollapsibleCard`) in `ui-shared/Common.kt`; implemented on Android Settings Server security & certificate fingerprint with one-touch copy

## Milestone 11: Docker, remote access and the desktop app (2026-10-10)
- [x] Server image (`Dockerfile`) and compose service on the host network; MQTT broker behind the `mqtt` profile
- [x] `GET/PUT /server/links`: home and remote address plus the certificate fingerprint
- [x] Web: Server addresses card in Settings
- [x] Android: home address at home, remote elsewhere, one session; Server addresses page
- [x] Desktop: connect page with LAN scan, home/remote switching, shared session token, certificate pinning, in-page title bar (no native bar or menu)
- [x] Desktop login screen: "Change server" action and connected host indicator on AuthScreen, with return navigation on connect page
- [x] Desktop theme synchronization: `connect.html` updated with botanical Material 3 tokens (`#12140E` / `#B1D18A`), dynamic theme detection, and official D mark
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
- [x] Mobile navigation parity: Android-style floating pill bottom navigation (`FloatingNavBar` parity) with expanding active capsule, backdrop blur, badge indicators, and 'More' sheet
- [x] Android theme preserved as original Material 3 Expressive botanical palette in `apps/android/ui-shared/src/main/java/com/aiyu/domus/ui/theme/Color.kt`
- [x] Architecture documentation with Mermaid diagrams in `development/docs/THEME_AND_NAVIGATION.md`

## Milestone 13: DiceBear Random Avatar & Universal Customization (DONE — 2026-10-10)
- [x] Backend database migration `0006_user_avatar.sql`: adds `avatar TEXT` column to `users` table
- [x] Backend models: `UserRecord` and `UserDto` include `avatar` with automatic fallback to deterministic `dicebear:bottts:{username}`
- [x] Backend API endpoint: `PUT /api/v1/auth/me/avatar` allowing any authenticated user to update their avatar; `CreateUserRequest` and `UpdateUserRequest` support `avatar`
- [x] Web & Desktop: integration of `@dicebear/core` and `@dicebear/collection` with 15 styles (Robots, Lorelei, Avataaars, Adventurer, Micah, Notionists, Pixel Art, Fun Emoji, Thumbs, Shapes, Rings, Identicon, Personas, Open Peeps, Big Smile)
- [x] Web & Desktop Avatar library (`apps/web/src/lib/avatar.ts`): offline inlined SVG data URI generator, spec parser (`dicebear:{style}:{seed}`), HTTP API fallback, seed randomizer
- [x] Web & Desktop UI components:
  - `Avatar.tsx`: responsive liquid glass styled avatar with sizes (`xs` to `2xl`), specular glow ring, error recovery and initials fallback
  - `AvatarPickerModal.tsx`: Apple liquid glass Avatar Studio dialog with real-time preview, 🎲 full avatar randomize, 🎲 seed roll, 15 visual collection selector cards, custom seed input, and quick suggestion presets
- [x] Web & Desktop Screen integration:
  - Settings screen: Account card profile banner with avatar, 1-click Quick Roll button, and full studio modal
  - Navigation sidebar: floating pill dock displays user avatar in both collapsed capsule and expanded pill modes
  - Mobile header and slide-out menu: displays user avatar and direct link to avatar customization
  - Household People list & UserSheet: each person displays their avatar, and admins can roll or pick avatars when creating/editing members
  - Overview dashboard: header displays user avatar with direct account link
  - First-run setup (`AuthScreen.tsx`): initial admin avatar preview with 1-click randomize
- [x] Native Android app (`apps/android`):
  - Model & API updates: `User.avatar`, `DomusApi.updateAvatar`, `DomusRepository.updateAvatar`
  - `UserAvatar` Compose component: removed intrusive grey circular border and background; clean, centered display with `ContentScale.Fit`
  - `AvatarCustomizationPage`: dedicated full-screen avatar studio (`SubPage`) with hero showcase, instant Randomize & Roll buttons, style chips, seed editor, and Apply action
  - Screen integration: Settings profile hero card and Home greeting header open full-screen studio
- [x] Real-time Multi-Device Synchronization:
  - Backend `EventBus`: added `SystemEvent::UserUpdated` and `SystemEvent::UsersChanged` broadcasts on avatar/user updates
  - Web & Desktop: `useLiveEvents` updates `AuthContext` state immediately on `user_updated` and invalidates query caches
  - Android: `DomusRepository.handle()` updates `_session.value` and `_revision` immediately on `user_updated` and `users_changed`
- [x] Architecture documentation with Mermaid diagram in `development/docs/AVATAR_SYSTEM.md`

## Milestone 14: App Flavors Architecture & Multi-Platform Isolation (DONE — 2026-10-10)
- [x] Android flavors (`apps/android`): `flavorDimensions += "environment"` with `dev` (`com.aiyu.domus.dev`, "Domus Dev", `-dev` suffix, amber DEV badge launcher icon) and `prod` (`com.aiyu.domus`, "Domus")
- [x] Android side-by-side install support: verified separate application IDs, sandboxed Linux UIDs, isolated Keystores, SharedPreferences, and databases
- [x] Android dev/prod scripts: `scripts/android-dev.sh` (installs `devDebug`, launches `com.aiyu.domus.dev`) and `scripts/android-prod.sh` (installs `prodDebug`/`prodRelease`)
- [x] Desktop flavors (`apps/desktop`): `DOMUS_FLAVOR` runtime environment variable isolating `userData` to `~/.config/DomusDev` (dev) vs `~/.config/Domus` (prod), and configuration files (`domus-dev.json` vs `domus.json`)
- [x] Desktop window and packaging isolation: window title "Domus (Dev)" vs "Domus", `build/icon-dev.png` with DEV badge, dedicated builder configs (`electron-builder.dev.json` producing `domus-dev` deb/AppImage vs `electron-builder.prod.json` producing `domus`)
- [x] Desktop after-install script: `build/after-install.sh` dynamically supports both `/opt/Domus Dev` and `/opt/Domus`
- [x] Web flavors (`apps/web`): `flavor.ts` module with flavor detection, isolated LocalStorage keys (`domus.dev.token` vs `domus.token`, `domus.dev.theme` vs `domus.theme`), dynamic `<title>` and `<link rel="icon">` switching (`/favicon-dev.svg`, `/manifest.dev.webmanifest`)
- [x] Web in-app indicator: non-intrusive amber DEV hairline pill in floating navigation dock and mobile header
- [x] Root & workspace scripts: added `android:dev`, `android:prod`, `android:build:dev`, `android:build:prod`, `dev:desktop`, `dev:desktop:prod`, `build:desktop:dev`, `build:desktop:prod`, `build:web:dev`, `build:web:prod`
- [x] Documentation & architecture: `development/docs/APP_FLAVORS.md` with Mermaid isolation diagrams, comparison matrix, and workflows

## Milestone 15: Startup Performance — Android baseline profile, web, backend, desktop (2026-10-10)
- [x] Android: `:baselineprofile` module (`BaselineProfileGenerator`: cold launch + tab walk), `androidx.baselineprofile` + `profileinstaller` in `:app`, profile merged into `src/main/generated/baselineProfiles` for both flavors, `pnpm android:profile`
- [ ] Android: re-record the profile with the dev app signed in (`pnpm android:profile`); the committed one covers launch + connect screens only
- [x] Web: avatar artwork out of the entry chunk, one lazy chunk per DiceBear style (entry JS 1.79 MB -> 0.33 MB)
- [x] Backend: brotli/gzip compression, immutable caching for `/assets/*`, `no-cache` for `index.html`
- [x] Desktop: saved server addresses probed in parallel at startup
- [x] Docs: `development/docs/PERFORMANCE.md` with diagram
- [x] Web: Inter bundled with the app (`@fontsource-variable/inter`), no request to Google Fonts

## Next
- [x] Sunrise / sunset automation triggers with an offset (`Trigger::Sun`, `home_core::sun_times`), home location in Settings on web and Android (this device's location, place search through the server, or typed)
- [ ] Android: run "Use this phone's location" and the place search on a device (compiled, not opened)
- [x] Backup and restore: Settings > Backup downloads the database with the master key inside, `domus-backend restore <file>` puts it back
- [ ] Backup: download from Android, restore from the UI, scheduled backups
- [ ] Android: verify LAN discovery and controls on a real phone with real devices
- [ ] Android: integration linking, device adoption, scene/automation editors, tariff settings, push notifications
- [ ] Verify against real hardware: Tuya account (QR), Tapo P110 + L900 found on LAN, Xiaomi device at 192.168.1.7
- [ ] Tuya local control (protocol 3.3/3.4/3.5) using stored local keys, cloud as fallback
- [ ] Tuya realtime MQTT push instead of polling
- [x] Tapo: hub child devices (H100)
- [ ] Xiaomi: legacy (non-MIoT) devices
- [x] MQTT integration (Home Assistant MQTT discovery, Zigbee2MQTT)
- [ ] Per-device energy tariffs
- [ ] Packaged Electron builds for macOS and Windows



## Milestone 16: Releases, update channels and the published image (2026-10-10)
- [x] Docker: `docker-compose.yml` runs `aiyuayaan/domus` (one-file setup, inline Mosquitto config), `docker-compose.local.yml` builds from source; distroless runtime, stripped thin-LTO binary, allow-list `.dockerignore` (image 146 MB -> 67 MB); `Cargo.lock` committed
- [x] Release workflow: marker commits (`!alpha` ... `!patch`) open a release PR, merging builds the image (amd64 + arm64), AppImage + deb and the signed APK, then tags and publishes; first release is `0.0.1-alpha.1`
- [x] One version and build number (root `package.json`) for server, web, desktop and Android (`scripts/set-version.mjs`)
- [x] Update channels (stable / beta / alpha): Android Settings > Updates, desktop self-update for the AppImage, Docker channel tags
- [x] `scripts/install-linux.sh` (menu entry with the app icon, `domus` command), README download section, `development/docs/RELEASE.md`
- [ ] Add the repository secrets and run the first `!alpha` release; the workflow itself has only been linted and simulated locally
- [x] Android: update downloaded and installed from Settings > Updates (asks only for the install permission)
- [x] Windows installer built by the release workflow (unverified until the first release; job is continue-on-error)
- [ ] Desktop: arm64 Linux build

## Milestone 17: About Domus page (2026-10-10)
- [x] Web + desktop: separate `/about` page (version, build, environment, privacy, source, developer) and `/about/acknowledgements`, linked from Settings > About; credits in `apps/web/src/lib/credits.ts`
- [x] Android: `About.kt` pages `about` and `acknowledgements` opened from Settings; same shared-axis enter and predictive-back shrink as every page, Acknowledgements backs out to About and slides by depth
- [ ] Check the predictive back gesture on a real Android 14+ device

## Milestone 18: MQTT, Philips Hue and Tapo hubs (2026-10-11)
- [x] Form-based linking: catalog entries list their inputs, web and Android render them (`POST /integrations/{id}/accounts`)
- [x] MQTT plugin: brokers linked as accounts, Home Assistant discovery (lights, switches, plugs, fans, sensors), run end to end against Mosquitto
- [x] Philips Hue plugin: button pairing, lights and plugs through the local bridge API, run against a stand-in bridge
- [x] Tapo H100 hub: child sensors, switches and KE100 thermostats through `control_child`
- [x] Tapo cameras appear under Discovered with a "not supported yet" note; `development/docs/INTEGRATIONS.md`
- [x] Device 12/24-hour clock format respected across Android (`DateFormat.is24HourFormat` + `ON_RESUME`, `formatBucket`, `formatClockTime`, `TimeInput`), web (`formatTime`, `formatClockTime`, `formatBucket`), and desktop (`clock:hour12` OS preference bridge)
- [ ] Verify on hardware: a real Zigbee2MQTT device, a real Hue bridge, a Tapo H100 with a sensor
- [ ] Tapo cameras: need TLS with RSA key exchange (OpenSSL, not rustls) and a camera to test on
- [ ] MQTT: covers and climate, devices without Home Assistant discovery (manual topics), state pushed as it arrives instead of on the poll
- [ ] Hue: motion sensors and scenes; follow the bridge when its IP changes
- [x] Sensor readings (motion, door or window, leak, alarm, battery) on the device page, web and Android

## Milestone 19: Access per room and per device (2026-10-11)
- [x] Device grants (`0007_device_access.sql`, `user_device_access`): a user gets whole rooms, single devices, or both; `device_ids` on the users API next to `room_ids`
- [x] Grant level per room and per device: see only or control (`can_control`, `view_only_room_ids` / `view_only_device_ids`); a device grant overrides its room; devices carry `can_control` for the user asking
- [x] Scenes and automations are listed and runnable only when the user can see every device they touch (they were open to every signed-in user)
- [x] Live stream re-reads access when users or rooms change and closes for a deleted account
- [x] Web: Settings > People, each room opens to None / See only / Control for the whole room and for each device; `development/docs/ARCHITECTURE.md` section 7
- [x] Android people editor: None / See only / Control per room and per device (`Grants` in `core/Models.kt`), saved from the emulator against the new server
- [x] Android: tiles and the device sheet disable controls from `can_control`; the device list reloads when access changes
- [x] Edit level above control (`0008_grant_edit.sql`): renames a device; the editors show None / See only / Control / Edit; the "All rooms" switch became "Custom access"
- [x] Person editor is a full screen on Android (`person:<id>` page, predictive back returns to People); the dialog is gone
- [x] Email: Generate button (`name@domus.home`, combinations of the username) and a live availability check on web and Android; duplicate emails answer 409
- [x] Android password fields have a show/hide eye
- [x] Access editor laid out the same on web and Android: a padded Custom access card, a card per room, one row per device with a level menu on the right
- [ ] Android: sign in as a see-only member on a device and check the disabled controls by eye
- [ ] Android: check the new person screen's Generate and Edit level on the emulator (the dev server there must be restarted to pick up the new backend)
- [ ] Android: grey out scenes and automations the user can see but not run (they answer 403 today)
- [ ] Web: grey out scenes and automations the user can see but not run (they answer 403 today)
- [x] Administrator alerts (`0010_notification_audience.sql`): accounts, discovery and failing automations are hidden from members and guests; read state is still shared
- [x] Accounts (`0009_account_recovery.sql`, `development/docs/ACCOUNTS.md`): generated passwords shown once to copy or share, forced change at first sign-in (enforced in the auth middleware), kid's accounts with an admin-set password
- [x] Forgot password without email: the request notifies administrators, who issue an 8-digit one-time code (30 minutes, 5 tries); web, desktop and Android screens
- [ ] Check the new Android sign-in pages and the Handover dialog by eye on the emulator (they compile and the API flow was run with curl, but were not opened)
- [ ] Check the web forgot-password and change-password screens and the person sheet by eye
- [x] Android: Settings > Change password (`ChangePasswordPage`)
- [x] Send "Password reset requested" to administrators only


## Milestone 20: Hardening, sun triggers, tariffs and the Updates page (2026-10-12)
- [x] Sign-in lockout (off in development), administrator-only alerts, backup and restore, bundled Inter font
- [x] Sunrise / sunset triggers, home location by place search or the device's location, time-of-use tariffs, sensor readings on the device page
- [x] Updates page on Android (`UpdatesPage`) and web / desktop (`/updates`) with Markdown release notes (tables and images), notes in the update dialog too; the Settings card is gone (`development/docs/RELEASE.md`)
- [ ] Android: open the Updates page, the update dialog with notes and the predictive back gesture on a device (compiled and shrunk with R8, not opened)
- [ ] Desktop: open `/updates` in the Electron window with a real update on the channel
- [ ] Write a release whose notes have a table and an image and check both renderers
- [ ] The repository was renamed to `aiyu-ayaan/Domus`; the apps still ask `aiyu-ayaan/Domus-Rust` and rely on GitHub's redirect
- [x] Ask before switching: per-device option kept on the server, warning dialog for the device's switch, room All on/off, groups, scenes and manual automation runs on web, desktop and Android
- [ ] Ask before switching on Android: open the dialog from a tile, a group and a scene on a device (compiled, not opened); the web group dialog was checked
- [ ] Ask before switching: unattended automations run without asking; decide if they should skip a guarded device and tell the administrators instead


## Milestone 21: Localization, every user-facing string in a catalog (2026-10-12)
Goal: no hard-coded UI text, so another language is a new catalog file. Branch `feat/localization`. Design and rules: `development/docs/LOCALIZATION.md`. 
- [x] Web: `lib/i18n.ts` (`t(key, params)`, plural by `key_one` / `key_other`) over `locales/en.json`; `scripts/i18n-scan.py` lists what is left
- [x] Web done: format, toast, shared ui, device labels, update prompt, sign-in, app shell, rooms, devices, overview (+ insights), device drawer / row / charts / light controls, settings
- [x] Web done: AutomationsView, RuleEditor, EnergyView, IntegrationsView, AirQualityView, AboutView, UpdatesView, AvatarPickerModal, ScreenSync, `lib/api.ts`, `lib/avatar.ts`, `lib/credits.ts` (group names), `lib/devices.tsx` leftovers
- [x] Desktop: move the strings in `apps/desktop/src` (`main.js`, `updates.js`, `connect.html`) to a catalog (`src/i18n.js`, `src/locales/en.json`)
- [x] Android: move every string to `res/values/strings.xml`; `core` has no Compose, so its errors, `AirLevel`, `UpdateChannel` and `Format` use message codes resolved in `:app` (`I18n.kt`)
- [x] Server: send `code` + `params` next to the English `message` for `ApiError` and notifications (additive, old clients keep the text); clients translate by code and fall back to `message`
- [x] Check on screen: web in the browser and the Electron window (nothing shows a raw key or a literal `\n`), Android on a device
- [x] Language choice: web and desktop follow the browser's / system's language list and fall back to English, one lazy catalog chunk per language on the web; Android follows the phone and has Settings > Language (`AppLocale.kt`)
- [x] Web in Arabic on screen: logical Tailwind classes everywhere, mirrored arrows and sheet, numbers / units / charts kept left to right (`ltr()` in `lib/format.ts`)
- [x] Language picker on the web and the desktop app (Settings > Appearance > Language; the desktop app keeps the choice in its config)
- [x] Translations (26 languages: `hi`, `es`, `pt-BR`, `id`, `ar`, `fr`, `ru`, `de`, `tr`, `ja`, `ko`, `it`, `vi`, `th`, `zh-CN`, `zh-TW`, `pl`, `bn`, `ta`, `te`, `mr`, `gu`, `kn`, `ml`, `pa`, `ur`) added and registered across Web, Desktop, and Android (`app` + `ui-shared`, `localeFilters` + `generateLocaleConfig`); machine translation, no native review


## Milestone 22: Analytics that keep the peaks (2026-10-12)
Design: `development/docs/ARCHITECTURE.md` (section 6 "Sampling", "Air quality history").
- [x] Backend: every poll feeds a per-device window; one row a minute with the average and the peak (`peak_watts`, `pm25_max`, migration `0013`)
- [x] Backend: `/energy/history` and `/air/history` return peaks, air returns the samples per WHO level; new `hours` range, `hour` range for air
- [x] Web: peak line and readout on the trend, 1 min range for air, day-by-hour grid on Energy and Air quality, time at each level
- [x] Android: peak line and readout, 1 min for air, time at each level, day-by-hour grid on both sections (opened on the emulator against a test server)
- [ ] Android: re-record the baseline profile (`pnpm android:profile`) after the new charts
- [ ] The home's `peak_watts` adds the devices' peaks per SQL group; store a per-minute home total if it must be exact


## Milestone 23: Android tablets (2026-10-12)
Design: `development/docs/ANDROID_APP.md` ("Wide screens", "Before sign-in on wide screens", "Settings on tablets").
- [x] Settings: list and detail from 600dp (`SettingsTab`, `PageHost`, `LocalHideBack`), selected row highlighted, fade-through between rows, shared-axis X for a nested page
- [x] Home, Devices, Scenes, Analytics: tab capped at 1240dp from 840dp, `SideBySide` columns, `DeviceGrid` four across (`LocalWideScreen`)
- [x] Onboarding, connect, sign-in, forgot / reset, choose password, unreachable: split in two from 840dp (`EntryColumn`, `OnboardingScreen`)
- [x] Tablet screenshots with demo data in the README (Home, Devices, Scenes, Analytics, Settings)
- [ ] Check portrait tablets, a home with many rooms / devices, a Scenes tab with only automations, and the phone layouts for regressions
- [ ] Check sign-in, forgot / reset password and onboarding pages 2 and 3 on a tablet, and the keyboard pushing the form up
- [ ] Editor pages (scene, automation, person) and other full-screen pages are still one 840dp column; give them a wide layout
- [ ] Settings pane: remember the open page across rotation and restore, decide what System back does at the pane's root
- [ ] Add onboarding and sign-in tablet screenshots (demo server, nothing that names a real server)
- [ ] Web and desktop: review the same screens at tablet widths
- [ ] Re-record the baseline profile after the layout changes (`pnpm android:profile`)

## Milestone 24: Kept history, device comparison and the desktop tray (2026-10-14)
Design: `development/docs/ARCHITECTURE.md` ("History outlives the device", "Comparing devices"), `DEPLOYMENT.md` (Desktop app, Tray).
- [x] Backend: removing a device keeps its readings; adding it again reuses its id (`removed_devices`, migration `0014`)
- [x] Web: device picker on the Energy and Air quality charts, one line per device with a hover readout of each
- [x] Desktop: tray / menu bar / top bar with PM2.5 and a power switch per purifier, opt-in in Settings, hint on GNOME without AppIndicator
- [x] Android: the same device comparison on Analytics (Electricity and Air, every range including live; opened on the emulator against a test server)
- [ ] Android: re-record the baseline profile (`pnpm android:profile`) after the comparison charts
- [ ] Show removed devices' history (pick them in the comparison, count them in the home's totals)
- [ ] Tray: smart plugs' power, start hidden at login
- [x] GNOME: Quick Settings tile through the `domus@aiyu.dev` Shell extension, installed from Settings (checked in a nested GNOME Shell 46)
- [x] Start with the computer: login item on Windows and macOS, XDG autostart on Linux, hidden in the tray or tile at login
- [ ] Check the tray and start-at-login on Windows and macOS hardware, and on a real KDE / XFCE session

## Road to v1.0.0 (assessment 2026-10-12, to work through later)
Order matters: each step unblocks the next. Suggested scope for 1.0: Android + web + Docker with Tuya, Tapo and Xiaomi; desktop, Hue, MQTT and Zigbee labelled beta.
1. Release pipeline
   - [ ] Add the repository secrets and run the first `!alpha` release; fix what the first real run shows
   - [ ] Fix the update source: apps still ask `aiyu-ayaan/Domus-Rust`, the repository is `aiyu-ayaan/Domus`
   - [ ] Release whose notes carry a table and an image; check both renderers
2. Verify on real devices (phone and tablet), then ship a beta
   - [ ] Android: sign-in pages, Handover dialog, Updates page and update dialog, predictive back on Android 14+, see-only member controls
   - [ ] Android: real-phone LAN discovery, Tuya QR link from the phone, integration linking, device adoption, scene / automation editors, tariff, push notifications, alerts service, Screen Sync capture
   - [ ] Real hardware: Tuya account, Tapo P110 + L900, Xiaomi device, Hue bridge, Zigbee2MQTT device, Tapo H100 with a sensor
   - [ ] Real Cloudflare Tunnel, `.deb` install and launcher icon
3. Close known gaps
   - [ ] Grey out scenes and automations the user can see but not run (they answer 403 today), on web and Android
   - [ ] Unattended automations skip the "ask before switching" guard: skip a guarded device and tell the administrators, or keep and document
   - [ ] Web: check the forgot-password and change-password screens and the person sheet; phone layout at 375px on a real device
   - [ ] Backup: download from Android, restore from the UI, scheduled backups
4. Automated tests (today: ~54 Rust tests, a few Android `core` tests, nothing for UI or end to end)
   - [ ] End to end: first-run setup, sign-in, link a device, control it, scene and automation run, backup and restore
   - [ ] Web component tests for sign-in, devices and settings; Android UI tests for the connect and sign-in flow
   - [ ] Run them in CI on every pull request
5. Decide the platform claim
   - [ ] Packaged Electron builds for macOS and Windows, arm64 Linux, or state that 1.0 is Linux desktop only
   - [ ] Optional SQLCipher full-database encryption: decide for or against before 1.0 ("all requests encrypted" is met by TLS)
6. Stability gate
   - [ ] A beta in daily use for about two weeks with no new data-loss, security or crash bug before tagging `!major`

## Milestone 17: Insight, smarter automations and voice (planned — 2026-10-14)
Plan and diagram: `development/docs/ROADMAP.md`. Order: each builds on the one before.
- [ ] Device logbook: per-device timeline from the event bus (what changed, who, from which app), retention limit, web + desktop + Android
- [ ] Automation run traces ("why didn't this fire?"): which trigger matched, which condition failed, each action's result; conditions `TimeBetween` / `DeviceState` already exist
- [ ] Left-on trigger: power above X for Y minutes (today `PowerAbove` fires instantly)
- [ ] Standby / left-on alerts from energy sampling (power above X for Y hours, monthly standby cost)
- [ ] Maintenance reminders: notify when purifier filter life drops below a threshold
- [ ] Weather from Open-Meteo (no key, uses the stored home location): outdoor temperature and PM2.5 on Overview, outdoor-AQI trigger
- [ ] Solar and grid export: net metering in the energy module (import/export readings, export tariff)
- [ ] Matter bridge: expose Domus devices to Google Home / Alexa locally (evaluate `rs-matter` maturity first)
