#!/usr/bin/env bash
# Static web release: Next.js export -> dist/web/ (host on any static server/CDN).
set -euo pipefail
: "${NEXT_PUBLIC_API_URL:=http://localhost:8000}"

echo "==> Web static export  (API baked in: $NEXT_PUBLIC_API_URL)"
cd /app/apps/web
NEXT_OUTPUT=export NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" bun run build

mkdir -p /dist/web
rm -rf /dist/web/*
cp -r out/. /dist/web/
echo "==> Done. Static site in dist/web/  (serve with any static host)"
