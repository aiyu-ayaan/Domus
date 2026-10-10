# Domus 

Domus is the home assisant app that will be deploy to the homeserver to controll all smart devices... It will have the plugging like enviroment to plug any integration like tuya,tapo and
many more.. 

It will include all the feature like automaction,ground devices like add them to bedroom, same like [Home Assistant](https://www.home-assistant.io/). 

## MVP
For MVP integration will include the devices from Tuya, Xiomi and Tapo. Philips Hue (local bridge) and MQTT (Home Assistant discovery) are also built in.

- For Tuya devices use the Scan QR functionality present on the Home Assistant https://www.home-assistant.io/integrations/tuya/#scanning-the-qr-code.. No admin pannel requirents..

## Languages 
Rust + MQTT + React

For Backend use the rust and for frontend use the react and react navigate for desktop build..

pnpm can be use to ran project. with `npm run dev` to ran both backend and frontend and also have `dev:web` and `dev:backend` to ran in individually.. `pnpm dev` also starts the Android dev gateway (`pnpm gateway`, see `scripts/gateway.mjs`); `pnpm android:dev` builds, installs and opens the Android app (`dev` flavor).

The project features physical App Flavors (`dev` and `prod`) across Android, Desktop, and Web so dev and prod instances do not interrupt each other (see `development/docs/APP_FLAVORS.md`):
- **Android**: `dev` (`com.aiyu.domus.dev`, "Domus Dev", amber DEV badge) vs `prod` (`com.aiyu.domus`, "Domus"). Both install side-by-side. Commands: `pnpm android:dev` and `pnpm android:prod`.
- **Desktop**: dev uses `~/.config/DomusDev` (`domus-dev.json`, window title `Domus (Dev)`, icon `icon-dev.png`), prod uses `~/.config/Domus`. Commands: `pnpm dev:desktop`, `pnpm dev:desktop:prod`, `pnpm build:desktop:dev`, `pnpm build:desktop:prod`.
- **Web**: dev isolates LocalStorage keys (`domus.dev.token`, `domus.dev.theme`), updates title/favicon (`/favicon-dev.svg`), and displays a sleek `DEV` pill in navigation. Commands: `pnpm dev:web`, `pnpm build:web:dev`, `pnpm build:web:prod`.

For Now database will be sqlite. and make sure all requirest are encrypted.. 


## User Flow 

For the first time login it will ask for the admin user account.. It will have the multi-account with roles and devices customisation and group access. 

App will include the 
- Home Screen with all data like make sure it will support the wide range of deicces for example I have smart switch and air purifier. So smart switch will tell me the current powerussage
and also I can set the electricity bill configuration.. 
- Devices to list down all devices and also that will be devices into two section that can able to create the group of the devices.. 
- Plugin section to connect with different providers 


Home section will contain full dashboard it all the interative data which is needed.

## File Structure

```
home-automation/
├── apps/
│   ├── web/                         # React + TypeScript
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── devices/
│   │   │   │   ├── automations/
│   │   │   │   ├── rooms/
│   │   │   │   └── energy/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── App.tsx
│   │   └── package.json
│   └── desktop/                      # Electron desktop app (server chooser, Linux packages)
│   └── android/                      # Native Android app (Kotlin + Compose): app, core, ui-shared
│
├── crates/
│   └── home-core/                   # Shared Rust domain logic
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
│
├── backend/                          # Rust modular monolith
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs                   # Application entry point
│       ├── lib.rs                    # Module registration
│       ├── bootstrap.rs              # Initialize app and dependencies
│       ├── config.rs                 # Environment configuration
│       │
│       ├── api/
│       │   ├── mod.rs
│       │   ├── routes.rs
│       │   ├── middleware.rs
│       │   └── error.rs
│       │
│       ├── modules/
│       │   ├── auth/
│       │   │   ├── mod.rs
│       │   │   ├── model.rs
│       │   │   ├── service.rs
│       │   │   ├── repository.rs
│       │   │   └── routes.rs
│       │   │
│       │   ├── devices/
│       │   │   ├── mod.rs
│       │   │   ├── model.rs
│       │   │   ├── service.rs
│       │   │   ├── repository.rs
│       │   │   └── routes.rs
│       │   │
│       │   ├── rooms/
│       │   ├── automations/
│       │   ├── scenes/
│       │   ├── schedules/
│       │   ├── energy/
│       │   ├── notifications/
│       │   └── users/
│       │
│       ├── integrations/           # one folder per plugin, see development/docs/INTEGRATIONS.md
│       │   ├── tuya/
│       │   ├── tapo/
│       │   ├── xiaomi/
│       │   ├── mqtt/
│       │   └── hue/
│       │
│       ├── automation_engine/
│       │   ├── mod.rs
│       │   ├── triggers.rs
│       │   ├── conditions.rs
│       │   ├── actions.rs
│       │   └── executor.rs
│       │
│       ├── infrastructure/
│       │   ├── database.rs
│       │   ├── event_bus.rs
│       │   └── logging.rs
│       │
│       └── workers/
│           ├── mod.rs
│           ├── device_worker.rs
│           └── scheduler_worker.rs
│
├── migrations/                       # SQL migrations
├── config/
│   ├── default.toml
│   └── development.toml
├── tests/
│   ├── integration/
│   └── fixtures/
├── res/                              # README media: screenshots/, domus.gif, domus.mp4, cover.jpg
├── scripts/
├── docker-compose.yml               # published image (aiyuayaan/domus)
├── docker-compose.local.yml         # builds from source
├── pnpm-workspace.yaml
├── package.json
├── Cargo.toml                        # Rust workspace root
├── .env.example
├── .gitignore
└── README.md
```

## AI Agents 

- Never add yourself as co-auther in any project.
- Commit message will able have the `scope(Change) : Message` structure
- @Development folder is for you. Add all the docs over their in @docs folder and for any tracking task I have created a @Development/TODO.md file track over their or create a new one if needed.
- You are allow to update the claude.md file or any other file releated to ai brain.
- Always use `codegraph` to scan the code. 
- For achitecture always or any changes make sure always add a achitecture diagram in docs.
- This app targets the most efficient home automaction solution.

## Work

- On this need to work on the web and electron version of the application.. 
- Docker, the Cloudflare Tunnel setup, the home/remote server addresses and the desktop app are documented in `development/docs/DEPLOYMENT.md`. Read it before changing `Dockerfile`, `docker-compose.yml`, `apps/desktop` or `modules/server.rs`. The desktop window has no native title bar or menu; keep it that way.
- Integrations (Tuya, Tapo with hubs, Xiaomi, MQTT, Philips Hue), how form-based linking works and what has been checked on real hardware are documented in `development/docs/INTEGRATIONS.md`. Read it before adding or changing a plugin under `backend/src/integrations` or the catalog in `modules/integrations/mod.rs`. New plugins describe their link form in the catalog, so no client change is needed. Tapo cameras are not supported (they need OpenSSL instead of rustls).
- Startup performance (Android baseline profile, web entry chunk, backend compression and asset caching, desktop server probing) is documented in `development/docs/PERFORMANCE.md`. Read it before touching `apps/android/baselineprofile`, the static file serving in `api/routes.rs` or anything imported by the web entry. Re-record the Android profile with `pnpm android:profile` after larger UI changes.
- Releases are marker commits on `master` (`!alpha`, `!beta`, `!stable`, `!fix`, `!feat`, `!major`, `!patch`) that open a release PR; merging it builds and publishes. Versions, the build number, update channels and the required secrets are in `development/docs/RELEASE.md`. Read it before changing `.github/workflows/release.yml`, `scripts/release-version.mjs`, `scripts/set-version.mjs`, `scripts/install-linux.sh` or any version field. Never edit a version by hand; `docker-compose.yml` runs the published image, `docker-compose.local.yml` builds from source.
- The native android app lives in `apps/android` (package `com.aiyu.domus`, modules `app`, `core`, `ui-shared`, Material 3 Expressive). Read `development/docs/ANDROID_APP.md` before changing it. It does not follow the web design profile below. Clicks give haptic feedback through the theme's `LocalIndication` (`ui-shared/.../theme/Haptics.kt`); use `HapticSwitch` rather than `Switch` for toggles with a callback.


## UI

UI follows the design profile in `design-system/domus/MASTER.md` (Minimalism & Swiss, generated with `/ui-ux-pro-max`). Read it before any UI change; page overrides go in `design-system/domus/pages/`. The earlier cartoonish liquid-glass look was rejected — keep it precise: neutral palette, green only for on/live state, hairline borders, small radii, subtle 150ms motion, no coloured icon tiles or gradients. 

## Brand

The logo is a D built from three modules, one of them `on` green. Masters and the PNG render script are in `design-system/domus/brand/`; read `development/docs/BRAND.md` before touching any icon, favicon or the Android splash. Use `/logo-design:logo-design` for logo work. The earlier house icon was rejected — don't bring a house back.
