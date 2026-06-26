#!/usr/bin/env bash
# Android release: Next export -> cap sync -> Gradle -> sign -> dist/android/.
# Produces a sideload APK and a Play-Store AAB.
set -euo pipefail
: "${NEXT_PUBLIC_API_URL:=http://localhost:8000}"

cd /app/apps/web
echo "==> Web static export  (API baked in: $NEXT_PUBLIC_API_URL)"
NEXT_OUTPUT=export NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" bun run build

echo "==> Capacitor sync (android)"
bunx cap sync android

echo "==> Gradle assembleRelease + bundleRelease"
cd android
./gradlew --no-daemon assembleRelease bundleRelease

APK=app/build/outputs/apk/release/app-release-unsigned.apk
AAB=app/build/outputs/bundle/release/app-release.aab
mkdir -p /dist/android

# Signing. Mount a real keystore at /keys/release.keystore (or set ANDROID_KEYSTORE)
# and the alias/passwords to produce store-ready artifacts. With no keystore we
# generate a throwaway key so the APK at least installs for sideloading — that
# build is NOT valid for Play upload.
KS="${ANDROID_KEYSTORE:-/keys/release.keystore}"
if [[ -f "$KS" ]]; then
  echo "==> Signing with mounted keystore: $KS"
  ALIAS="${ANDROID_KEY_ALIAS:?set ANDROID_KEY_ALIAS}"
  STOREPASS="${ANDROID_KEYSTORE_PASSWORD:?set ANDROID_KEYSTORE_PASSWORD}"
  KEYPASS="${ANDROID_KEY_PASSWORD:-$STOREPASS}"
  REAL_KEY=1
else
  echo "WARNING: no keystore at $KS — generating a throwaway key (sideload only)."
  KS=/tmp/throwaway.keystore; ALIAS=domus; STOREPASS=android; KEYPASS=android
  keytool -genkeypair -v -keystore "$KS" -alias "$ALIAS" -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass "$STOREPASS" -keypass "$KEYPASS" \
    -dname "CN=Domus, OU=Dev, O=Domus, C=US"
  REAL_KEY=0
fi

# Newest installed build-tools has zipalign + apksigner.
BT=$(find "$ANDROID_SDK_ROOT/build-tools" -maxdepth 1 -mindepth 1 -type d | sort -V | tail -1)
"$BT/zipalign" -f 4 "$APK" /tmp/aligned.apk
"$BT/apksigner" sign --ks "$KS" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$STOREPASS" --key-pass "pass:$KEYPASS" \
  --out /dist/android/domus-release.apk /tmp/aligned.apk
echo "==> APK -> dist/android/domus-release.apk"

if [[ "$REAL_KEY" == 1 ]]; then
  jarsigner -keystore "$KS" -storepass "$STOREPASS" -keypass "$KEYPASS" \
    -signedjar /dist/android/domus-release.aab "$AAB" "$ALIAS"
  echo "==> AAB -> dist/android/domus-release.aab (signed — ready for Play)"
else
  cp "$AAB" /dist/android/domus-release-unsigned.aab
  echo "==> AAB -> dist/android/domus-release-unsigned.aab (sign with YOUR upload key before Play)"
fi
echo "==> Done."
