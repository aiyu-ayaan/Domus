# Building release artifacts with Docker

One-shot Docker builders produce installable apps into `./dist/` — no local JDK,
Android SDK, or Electron toolchain needed. Defined in `docker-compose.release.yml`.

## What Docker can and can't build

| Target | Output | Docker? |
|--------|--------|---------|
| Web (static) | `dist/web/` — static site for any host/CDN | ✅ |
| Web (server) | the production image (`docker compose up web`) | ✅ already |
| Android | `dist/android/` — `.apk` (sideload) + `.aab` (Play) | ✅ |
| Desktop Linux | `dist/desktop/` — `.AppImage` | ✅ |
| Desktop Windows | `dist/desktop/` — `.exe` (cross-built via Wine) | ✅ |
| Desktop macOS | `.dmg` | ❌ Mac only |
| iOS | `.ipa` | ❌ Mac + Xcode only |

For the Apple targets, build on a Mac: `bun run ios`, or `electron-builder --mac`
in `apps/web/electron`.

## 1. Set the API URL first (important)

Every client bakes `NEXT_PUBLIC_API_URL` at build time. Point it at your server's
**publicly reachable** address in `.env` before building, or the apps will call
`localhost`:

```env
PUBLIC_API_URL=https://api.yourdomain.com
```

(Blank → defaults to `http://localhost:${API_PORT}`, fine only for same-machine web.)

## 2. Build

```bash
bun run release:web        # -> dist/web/
bun run release:android    # -> dist/android/
bun run release:desktop    # -> dist/desktop/
bun run release            # all three
```

or directly:

```bash
docker compose -f docker-compose.release.yml run --rm --build android
```

`--build` re-snapshots the source each release. First Android run is slow and
large (~3 GB SDK download, cached afterwards); the desktop image pulls Wine.

## 3. Android signing

Without a keystore the APK is signed with a **throwaway key** — installable for
sideloading, but **not** valid for Play upload, and the AAB is left unsigned.

For real releases, drop your keystore at `./release-keys/release.keystore` and set
in `.env`:

```env
ANDROID_KEY_ALIAS=upload
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_PASSWORD=...
```

Generate one once:

```bash
keytool -genkeypair -v -keystore release-keys/release.keystore \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`release-keys/` and `*.keystore` are gitignored — keep them out of the repo.

## 4. Desktop signing

Installers are **unsigned** (Windows SmartScreen will warn). To sign, add `win.certificateFile` /
`mac` signing identity to `apps/web/electron/electron-builder.config.json`.

## Notes

- Artifacts land in `./dist/` (gitignored).
- Android targets `compileSdk 36`; if `build-tools;36.0.0` is unavailable, bump the
  version in `docker/release.android.Dockerfile`.
- Uses BuildKit per-Dockerfile `.dockerignore` files so the `android`/`electron`
  projects (excluded by the root `.dockerignore`) reach those builders. Docker
  Compose v2 enables BuildKit by default.
