#!/usr/bin/env bash
# Build the production Android app variant, install on connected phone/emulator and open it.
set -euo pipefail
cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$SDK/platform-tools/adb"

if ! "$ADB" devices | awk 'NR>1 && $2=="device"' | grep -q .; then
  AVD="$("$SDK/emulator/emulator" -list-avds | head -1)"
  [ -n "$AVD" ] || { echo "No phone connected and no emulator set up. Plug in a phone with USB debugging on." >&2; exit 1; }
  echo "Starting emulator $AVD…"
  nohup "$SDK/emulator/emulator" -avd "$AVD" >/dev/null 2>&1 &
  "$ADB" wait-for-device
  until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
fi

(cd apps/android && ./gradlew :app:installProdDebug)
"$ADB" shell am start -n com.aiyu.domus/com.aiyu.domus.MainActivity >/dev/null
echo "Domus (Production flavor) is open."
