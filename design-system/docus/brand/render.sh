#!/bin/sh
# Re-render PNG icons from the SVG masters. Needs google-chrome.
cd "$(dirname "$0")/../../.."
r() { # svg size out
  google-chrome --headless --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=$2,$2 --screenshot="$3" "file://$PWD/$1?" >/dev/null 2>&1
}
B=design-system/docus/brand
for s in 192 512; do r $B/app-icon.svg $s apps/web/public/icon-$s.png; done
r $B/app-icon-square.svg 180 apps/web/public/apple-touch-icon.png
r $B/app-icon.svg 512 apps/desktop/build/icon.png
