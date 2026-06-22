# Running Domus — Web, PWA, Mobile & Desktop

Domus runs from a **single codebase** (`apps/web`, a client-rendered Next.js
app) on five targets:

| Target          | How it ships                          | Build on        |
| --------------- | ------------------------------------- | --------------- |
| Web             | `next start` (Node) or static `out/`  | any             |
| Installable PWA | the web app + service worker          | any             |
| Android         | Capacitor → APK / Play Store          | Win/Mac/Linux\* |
| iOS             | Capacitor → App Store                 | **macOS only**  |
| Windows / macOS | Capacitor (Electron) → installer      | Win/Mac         |

\* Android needs JDK 17–21 + the Android SDK (see below).

All native targets wrap the **same** static export of the web app. They talk to
your self-hosted Domus API over the network — there is no separate mobile API.

---

## 1. Prerequisites

- **Bun** ≥ 1.3, **Node** ≥ 20, **Python** 3.12+ (for the API)
- **PostgreSQL** + **Redis** (`docker-compose up postgres redis`)
- Android builds: **JDK 17–21** and **Android Studio** / Android SDK
  (`ANDROID_HOME` set). Newer JDKs (22+) break the Gradle version Capacitor
  uses — install Temurin 17 or use Android Studio's bundled JDK.
- iOS builds: **macOS**, **Xcode**, **CocoaPods**
- Desktop builds: nothing extra (Electron is pulled in as a dependency)

```bash
bun install                       # all workspaces
docker-compose up postgres redis  # data stores
```

---

## 2. Local development (web + API)

```bash
bun run dev:api   # FastAPI on :8000 (needs the Python venv — see CLAUDE.md)
bun run dev:web   # Next.js on :3000
```

Open http://localhost:3000. The browser bundle reads the API address from
`NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`).

---

## 3. The API URL — this is what makes it work "from anywhere"

`NEXT_PUBLIC_API_URL` is **baked into the bundle at build time** (it's a
`NEXT_PUBLIC_*` var). Whatever value is set when you build is what every web,
mobile, and desktop client will call.

- Local only: leave it as `http://localhost:8000`.
- Reachable from anywhere: point it at your self-hosted backend's public
  HTTPS address, e.g. `https://domus.example.com`.

All env lives in the **repo root** `.env` (copy from root `.env.example`) — one
file shared by the API and the web/mobile/desktop clients. `apps/web` pulls the
`NEXT_PUBLIC_*` keys up from the root via `next.config.mjs`, so you don't keep a
separate web env file. A shell variable still overrides the file:

```bash
# edit root .env, or override inline for one build:
NEXT_PUBLIC_API_URL=https://domus.example.com bun run build:native
```

> Self-hosting / remote access (exposing your home backend to the internet) is
> out of scope for the app itself — you provide the public URL. Because devices
> live on your home LAN, the **backend must run on your home network**; expose
> it with whatever you already use (reverse proxy, tunnel, VPN). The clients
> only need the URL above.

---

## 4. Web & installable PWA

```bash
bun --filter @domus/web build     # Node server build
bun --filter @domus/web start     # serve on :3000
```

Visiting the site in a modern browser offers **Install / Add to Home Screen**.
The PWA precaches the app shell (works offline until it needs the API) via
`apps/web/public/sw.js`; install metadata lives in
`apps/web/public/manifest.webmanifest`.

To serve as a pure static site instead of a Node server:

```bash
NEXT_OUTPUT=export bun --filter @domus/web build   # writes apps/web/out/
# serve apps/web/out/ with any static host; rewrite unknown paths to /index.html
```

---

## 5. Android

```bash
cd apps/web
NEXT_PUBLIC_API_URL=https://domus.example.com bun run android
# = export build + cap sync + open Android Studio
```

In Android Studio press **Run** for an emulator/device, or build an APK:

```bash
cd apps/web/android
./gradlew assembleDebug            # APK at app/build/outputs/apk/debug/
```

Sideload that APK, or `./gradlew bundleRelease` for a signed Play Store AAB.

---

## 6. iOS (macOS only)

```bash
cd apps/web
bun run build:native               # produces out/ and syncs platforms
bunx cap add ios                   # one-time, on a Mac
bun run ios                        # opens Xcode
```

Run on a simulator/device from Xcode; archive for the App Store as usual.

---

## 7. Desktop (Windows & macOS)

```bash
cd apps/web
NEXT_PUBLIC_API_URL=https://domus.example.com bun run desktop
# = export build + cap sync + launch the Electron app
```

Package installers:

```bash
cd apps/web/electron
npm run electron:pack              # unpacked app in dist/
npm run electron:make             # platform installer (.exe / .dmg)
```

(macOS installers must be built on a Mac; Windows installers on Windows.)

---

## 8. One-liners reference

| Command (from `apps/web`)      | Does                                          |
| ------------------------------ | --------------------------------------------- |
| `bun run dev`                  | Web dev server                                |
| `bun run build` / `start`      | Web Node server build / serve                 |
| `bun run build:native`         | Static export (`out/`) + `cap sync`           |
| `bun run android`              | build:native + open Android Studio            |
| `bun run ios`                  | build:native + open Xcode (macOS)             |
| `bun run desktop`              | build:native + launch Electron app            |
