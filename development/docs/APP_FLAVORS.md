# App Flavors Architecture (Web, Desktop, Android)

This document specifies the multi-platform flavor architecture designed to allow development (`dev`) and production (`prod`) versions of Docus to run, build, and coexist simultaneously on the same machine or device without data collision, configuration clobbering, or session interruption.

---

## 1. Architecture & Isolation Overview

```mermaid
flowchart TD
    subgraph Platforms["Docus Multi-Platform Clients"]
        subgraph Android["Android (apps/android)"]
            A_DEV["Dev Flavor<br/>ID: com.aiyu.domus.dev<br/>App: Docus Dev<br/>Icon: D Mark + Amber DEV Badge<br/>Store: Private Keystore & DB"]
            A_PROD["Prod Flavor<br/>ID: com.aiyu.domus<br/>App: Docus<br/>Icon: Canonical Brand Mark<br/>Store: Private Keystore & DB"]
        end

        subgraph Desktop["Desktop Electron (apps/desktop)"]
            D_DEV["Dev Flavor<br/>ID: com.aiyu.domus.dev<br/>Title: Docus (Dev)<br/>UserData: ~/.config/DocusDev<br/>Config: docus-dev.json<br/>Bin: docus-dev"]
            D_PROD["Prod Flavor<br/>ID: com.aiyu.domus<br/>Title: Docus<br/>UserData: ~/.config/Docus<br/>Config: docus.json<br/>Bin: docus"]
        end

        subgraph Web["Web SPA (apps/web)"]
            W_DEV["Dev Flavor<br/>Title: Docus (Dev)<br/>Badge: Amber DEV Pill<br/>Token: docus.dev.token<br/>Theme: docus.dev.theme<br/>Icon: /favicon-dev.svg"]
            W_PROD["Prod Flavor<br/>Title: Docus<br/>Badge: None<br/>Token: docus.token<br/>Theme: docus.theme<br/>Icon: /favicon.svg"]
        end
    end

    subgraph HostStorage["Host & Device Physical Isolation"]
        OS_ANDROID["Android OS Sandboxing<br/>Separate Linux UIDs & /data/data/ dirs"]
        OS_FS["Host File System<br/>Independent ~/.config directories"]
        BROWSER_STORAGE["Browser Storage<br/>Flavor-prefixed LocalStorage keys"]
    end

    A_DEV & A_PROD --> OS_ANDROID
    D_DEV & D_PROD --> OS_FS
    W_DEV & W_PROD --> BROWSER_STORAGE
```

---

## 2. Flavor Matrix Comparison

| Platform | Dimension | Development (`dev`) | Production (`prod`) |
|---|---|---|---|
| **Android** | Package / Application ID | `com.aiyu.domus.dev` | `com.aiyu.domus` |
| | App Label / Title | `Docus Dev` | `Docus` |
| | Version Suffix | `-dev` | *(none)* |
| | Launcher Icon | Adaptive D mark with amber `DEV` pill badge | Canonical D mark |
| | Keystore / Storage | Sandboxed to `com.aiyu.domus.dev` | Sandboxed to `com.aiyu.domus` |
| | Side-by-side Install | **Yes** (different package ID) | **Yes** (different package ID) |
| **Desktop** | App ID (`appId`) | `com.aiyu.domus.dev` | `com.aiyu.domus` |
| | Product Name | `Docus Dev` | `Docus` |
| | Executable Name | `docus-dev` | `docus` |
| | Linux Package (`.deb`) | `docus-dev_${version}_${arch}.deb` (`/opt/Docus Dev`) | `docus_${version}_${arch}.deb` (`/opt/Docus`) |
| | User Data Path | `~/.config/DocusDev` (`app.setPath('userData', ...)`) | `~/.config/Docus` |
| | Config File | `docus-dev.json` | `docus.json` |
| | Window Title | `Docus (Dev)` | `Docus` |
| | WMClass / Launcher | `Docus Dev` (`icon-dev.png`) | `Docus` (`icon.png`) |
| | Side-by-side Install | **Yes** (separate `/opt/` and binaries) | **Yes** (separate `/opt/` and binaries) |
| **Web** | Application Name | `Docus (Dev)` | `Docus` |
| | Document Title | `Docus (Dev)` | `Docus` |
| | Favicon / PWA Icon | `/favicon-dev.svg` / `/icon-dev-*.png` | `/favicon.svg` / `/icon-*.png` |
| | Web Manifest | `/manifest.dev.webmanifest` | `/manifest.webmanifest` |
| | Auth Token Key | `docus.dev.token` | `docus.token` |
| | Theme Storage Key | `docus.dev.theme` | `docus.theme` |
| | Visual In-App Badge | Amber `DEV` hairline chip in header & rail | None (clean minimal brand) |

---

## 3. Platform Details

### 3.1 Android (`apps/android`)

Flavors are configured using Gradle `flavorDimensions += "environment"`:
- `dev`:
  - `applicationIdSuffix = ".dev"`
  - `versionNameSuffix = "-dev"`
  - String resource `@string/app_name` = `"Docus Dev"` (in `src/dev/res/values/strings.xml`)
  - Icon overlay `ic_launcher_foreground.xml` (in `src/dev/res/drawable/`) with the brand mark and a sharp amber `DEV` pill badge.
- `prod`:
  - Canonical package `com.aiyu.domus`
  - String resource `@string/app_name` = `"Docus"` (in `src/prod/res/values/strings.xml`)
  - Canonical brand launcher icon.

Because Android isolates apps by application ID, `com.aiyu.domus.dev` and `com.aiyu.domus` run as completely separate Linux user IDs with separate Keystores, SharedPreferences, SQLite files, and notification channels.

### 3.2 Desktop (`apps/desktop`)

Electron isolates runtime state based on `process.env.DOCUS_FLAVOR`:
1. When running unpackaged (`pnpm dev:desktop`) or with `DOCUS_FLAVOR=dev`:
   - `app.setPath('userData', path.join(appData, 'DocusDev'))`
   - Config file is saved to `docus-dev.json`.
   - Window title is locked to `Docus (Dev)`.
   - Desktop icon loaded is `build/icon-dev.png`.
2. Packaging:
   - `pnpm build:desktop:dev`: Uses `electron-builder.dev.json` to produce `docus-dev` deb and AppImage.
   - `pnpm build:desktop:prod`: Uses `electron-builder.prod.json` to produce `docus` deb and AppImage.
   - The post-install script `build/after-install.sh` detects both `/opt/Docus Dev` and `/opt/Docus`, setting up appropriate symlinks (`/usr/bin/docus-dev` and `/usr/bin/docus`) without overwriting one another.

### 3.3 Web (`apps/web`)

Web uses `apps/web/src/lib/flavor.ts`:
- Checks `import.meta.env.VITE_APP_FLAVOR`, the desktop bridge (`window.docus?.flavor`), or Vite dev mode (`import.meta.env.DEV`).
- Storage key isolation:
  - Auth token: `docus.dev.token` vs `docus.token`.
  - Theme preference: `docus.dev.theme` vs `docus.theme`.
- DOM Head updates:
  - Updates `<title>` and `<link rel="icon">` dynamically to point to `/favicon-dev.svg` and `/manifest.dev.webmanifest`.
- In-App UI Badge:
  - Renders a subtle `DEV` indicator in the floating pill dock and mobile navigation header.

---

## 4. Commands & Workflows

### Android
```bash
pnpm android:dev        # Builds, installs and launches Domus Dev on phone/emulator
pnpm android:prod       # Builds, installs and launches Domus Prod
pnpm android:build:dev  # Assembles devDebug APK
pnpm android:build:prod # Assembles prodRelease APK
```

### Desktop
```bash
pnpm dev:desktop          # Runs Electron in dev flavor (~/.config/DocusDev)
pnpm dev:desktop:prod     # Runs Electron in prod flavor (~/.config/Docus)
pnpm build:desktop:dev    # Builds docus-dev (.deb & AppImage)
pnpm build:desktop:prod   # Builds docus (.deb & AppImage)
```

### Web
```bash
pnpm dev:web              # Runs Vite dev server (dev flavor)
pnpm build:web:dev        # Builds SPA in dev mode
pnpm build:web:prod       # Builds SPA in production mode
```
