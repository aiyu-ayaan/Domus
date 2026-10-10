#!/bin/sh
# Install, update or remove the Domus desktop app on Linux (x86_64), for this user, no root.
#
#   curl -fsSL https://raw.githubusercontent.com/aiyu-ayaan/Domus-Rust/master/scripts/install-linux.sh | sh
#   ... | sh -s -- --channel beta     beta builds (and stable ones)
#   ... | sh -s -- --version 0.0.1    a specific release
#   ... | sh -s -- --uninstall        remove it (settings stay in ~/.config/Domus)
#
# The AppImage goes to ~/.local/share/domus, a place this user owns, because the app updates
# itself by replacing that file (apps/desktop/src/main.js). It also gets a menu entry with the
# app's own icon and a `domus` command. Re-running it updates.
#
# POSIX sh: it is piped into whatever `sh` is, which on Debian and Ubuntu is dash.
set -eu

API="${DOMUS_RELEASES_URL:-https://api.github.com/repos/aiyu-ayaan/Domus-Rust/releases?per_page=100}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APP="$DATA_HOME/domus/Domus.AppImage"
BIN="$HOME/.local/bin/domus"
# Named like the entry inside the AppImage; StartupWMClass below is what ties the window to it.
DESKTOP_FILE="$DATA_HOME/applications/domus.desktop"
ICON_PATH="usr/share/icons/hicolor/512x512/apps/domus.png"
ICON_FILE="$DATA_HOME/icons/hicolor/512x512/apps/domus.png"

CHANNEL=stable
VERSION=""
FROM_FILE=""
UNINSTALL=0

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --channel) CHANNEL="${2:?--channel needs a value}"; shift 2 ;;
    --version) VERSION="${2:?--version needs a value}"; VERSION="${VERSION#v}"; shift 2 ;;
    --from-file) FROM_FILE="${2:?--from-file needs a path}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h | --help) sed -n '2,7p' "$0" 2>/dev/null || true; echo "  --from-file PATH   install a local AppImage"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done
case "$CHANNEL" in stable | beta | alpha) ;; *) die "--channel must be stable, beta or alpha" ;; esac
[ "$(id -u)" -ne 0 ] || die "run this as the user who will use Domus, not as root."

refresh_menus() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$DATA_HOME/applications" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$DATA_HOME/icons/hicolor" 2>/dev/null || true
}

if [ "$UNINSTALL" -eq 1 ]; then
  rm -f "$APP" "$APP.part" "$DESKTOP_FILE" "$ICON_FILE"
  # Only our own link.
  if [ -L "$BIN" ] && [ "$(readlink "$BIN")" = "$APP" ]; then rm -f "$BIN"; fi
  rmdir "$DATA_HOME/domus" 2>/dev/null || true
  refresh_menus
  echo "Domus is removed. Its settings are kept in ${XDG_CONFIG_HOME:-$HOME/.config}/Domus."
  exit 0
fi

case "$(uname -m)" in x86_64 | amd64) ;; *) die "Domus for Linux is built for x86_64 only; this machine is $(uname -m)." ;; esac

mkdir -p "$DATA_HOME/domus"
trap 'rm -f "$APP.part"' EXIT INT TERM

if [ -n "$FROM_FILE" ]; then
  cp "$FROM_FILE" "$APP.part" || die "cannot read $FROM_FILE"
  label="$(basename "$FROM_FILE")"
else
  if command -v curl >/dev/null 2>&1; then
    fetch() { curl -fsSL --retry 3 "$1"; }
    fetch_to() { curl -fL --retry 3 --progress-bar -o "$2" "$1"; }
  elif command -v wget >/dev/null 2>&1; then
    fetch() { wget -qO- "$1"; }
    fetch_to() { wget -q --show-progress -O "$2" "$1"; }
  else
    die "curl or wget is needed to download Domus."
  fi

  echo "Looking up Domus releases..."
  releases="$(fetch "$API")" || die "could not reach GitHub. Try again in a while."
  # Every AppImage URL as "<sort key> <version> <url>"; the newest is last after a sort. The key
  # orders by number, then alpha < beta < stable, then the pre-release number (plain `sort -V`
  # puts 0.0.1 before 0.0.1-alpha.1). A channel takes its own builds and every steadier one.
  newest="$(printf '%s\n' "$releases" | grep -oE 'https://[^"]*/Domus-[0-9][^"/]*\.AppImage' | sort -u |
    awk -v channel="$CHANNEL" -v want="$VERSION" '{
      v = $0; sub(/.*\/Domus-/, "", v); sub(/\.AppImage$/, "", v)
      if (v !~ /^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)\.[0-9]+)?$/) next
      split(v, p, /[.-]/)
      stage = 2; n = 99999
      if (p[4] == "alpha") { stage = 0; n = p[5] } else if (p[4] == "beta") { stage = 1; n = p[5] }
      if (want != "" ? v != want : (stage == 0 && channel != "alpha") || (stage == 1 && channel == "stable")) next
      printf "%08d.%08d.%08d.%d.%08d %s %s\n", p[1], p[2], p[3], stage, n, v, $0
    }' | sort | tail -n 1)"
  [ -n "$newest" ] || die "no Linux build found for ${VERSION:-the $CHANNEL channel}. Try --channel alpha, or see the releases page."
  label="$(printf '%s' "$newest" | cut -d' ' -f2)"
  echo "Downloading Domus $label..."
  fetch_to "$(printf '%s' "$newest" | cut -d' ' -f3)" "$APP.part" || die "the download failed. Nothing was changed."
fi

# An error page saved under the right name must not become the app.
[ "$(head -c 4 "$APP.part" | od -An -c | tr -d ' \n')" = '177ELF' ] || die "that is not an AppImage. Nothing was changed."
chmod 755 "$APP.part"
# A rename within one directory: a running copy keeps running from the old file until restarted.
mv -f "$APP.part" "$APP"
trap - EXIT INT TERM

# The icon comes out of the AppImage itself, so it is always this build's.
tmp="$(mktemp -d)"
if (cd "$tmp" && "$APP" --appimage-extract "$ICON_PATH" >/dev/null 2>&1) && [ -f "$tmp/squashfs-root/$ICON_PATH" ]; then
  mkdir -p "$(dirname "$ICON_FILE")"
  cp "$tmp/squashfs-root/$ICON_PATH" "$ICON_FILE"
else
  echo "warning: could not read the icon out of the AppImage; the menu entry will use a generic one." >&2
fi
rm -rf "$tmp"

# Same fields as the entry electron-builder writes into the AppImage. The icon is an absolute
# path so it shows without waiting for the icon theme cache.
mkdir -p "$(dirname "$DESKTOP_FILE")"
cat >"$DESKTOP_FILE" <<ENTRY
[Desktop Entry]
Type=Application
Name=Domus
Comment=Smart home control
Exec="$APP" --no-sandbox %U
TryExec=$APP
Icon=$ICON_FILE
Terminal=false
Categories=Utility;
StartupWMClass=Domus
ENTRY
refresh_menus

mkdir -p "$(dirname "$BIN")"
if [ ! -e "$BIN" ] || [ -L "$BIN" ]; then ln -sf "$APP" "$BIN"; fi

echo "Domus $label is installed: find it in your applications menu, or run 'domus'."
if [ ! -e /dev/fuse ]; then
  echo "warning: FUSE is not available, so Domus unpacks itself on every start (slower). Install fuse3 with your package manager." >&2
fi
