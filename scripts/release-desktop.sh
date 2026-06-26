#!/usr/bin/env bash
# Desktop release: Next export -> cap copy electron -> electron-builder.
# Targets Linux (AppImage) + Windows (.exe nsis, cross-built via Wine).
# macOS .dmg is NOT here — it can only be built on a Mac.
set -euo pipefail
: "${NEXT_PUBLIC_API_URL:=http://localhost:8000}"

cd /app/apps/web
echo "==> Web static export  (API baked in: $NEXT_PUBLIC_API_URL)"
NEXT_OUTPUT=export NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" bun run build

echo "==> Capacitor copy (electron)"
bunx cap copy electron

cd electron
echo "==> Install electron deps + compile"
npm ci || npm install
npm run build

echo "==> electron-builder: linux + win"
npx electron-builder --linux --win --publish never -c electron-builder.config.json

mkdir -p /dist/desktop
# electron-builder writes installers to electron/dist/. Grab the distributables.
find dist -maxdepth 1 -type f \
  \( -name '*.AppImage' -o -name '*.deb' -o -name '*.exe' -o -name '*.snap' \) \
  -exec cp {} /dist/desktop/ \;
echo "==> Desktop installers -> dist/desktop/"
echo "==> Done.  (installers are unsigned — add certs in electron-builder.config.json for store/SmartScreen)"
