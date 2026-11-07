#!/usr/bin/env bash
# Install (or remove) the Funnel intake app for the current macOS user.
#
#   ./install-intake.sh [--url http://localhost:3000] [--hotkey "Option+F"]
#                       [--source chat] [--binary ./funnel-intake]
#                       [--no-start] [--uninstall] [--keep-config]
set -euo pipefail

URL="http://localhost:3000"
HOTKEY="Option+F"
SOURCE=""
BINARY=""
NO_START=0
UNINSTALL=0
KEEP_CONFIG=0

while [ $# -gt 0 ]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --hotkey) HOTKEY="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --binary) BINARY="$2"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    --hotkey=*) HOTKEY="${1#*=}"; shift ;;
    --source=*) SOURCE="${1#*=}"; shift ;;
    --binary=*) BINARY="${1#*=}"; shift ;;
    --no-start) NO_START=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --keep-config) KEEP_CONFIG=1; shift ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

INSTALL_DIR="$HOME/Library/Application Support/Funnel/Intake"
CONFIG="$INSTALL_DIR/config.json"
LOG="$INSTALL_DIR/intake.log"
INSTALLED="$INSTALL_DIR/funnel-intake"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/com.t128n.funnel.intake.plist"

if [ "$UNINSTALL" -eq 1 ]; then
  if [ -x "$INSTALLED" ]; then
    "$INSTALLED" autostart disable >/dev/null 2>&1 || true
  else
    launchctl unload "$LAUNCH_AGENT" >/dev/null 2>&1 || true
    rm -f "$LAUNCH_AGENT"
  fi
  pkill -f "$INSTALLED" >/dev/null 2>&1 || true
  if [ "$KEEP_CONFIG" -eq 1 ]; then
    rm -f "$INSTALLED"
    echo "Kept config and logs: $INSTALL_DIR"
  else
    rm -rf "$INSTALL_DIR"
    echo "Removed install directory: $INSTALL_DIR"
  fi
  exit 0
fi

if [ -z "$BINARY" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  for candidate in "$SCRIPT_DIR/funnel-intake" "$SCRIPT_DIR/../dist/funnel-intake"; do
    if [ -f "$candidate" ]; then
      BINARY="$candidate"
      break
    fi
  done
fi
if [ -z "$BINARY" ] || [ ! -x "$BINARY" ]; then
  echo "Cannot find funnel-intake. Build it first with 'mise run intake:exe', or pass --binary." >&2
  exit 1
fi

pkill -f "$INSTALLED" >/dev/null 2>&1 || true
mkdir -p "$INSTALL_DIR"
cp "$BINARY" "$INSTALLED"
chmod +x "$INSTALLED"

if [ ! -f "$CONFIG" ]; then
  printf '{}\n' > "$CONFIG"
fi
plutil -replace url -string "$URL" "$CONFIG"
plutil -replace hotkey -string "$HOTKEY" "$CONFIG"
if [ -n "$SOURCE" ]; then
  plutil -replace source -string "$SOURCE" "$CONFIG"
else
  plutil -remove source "$CONFIG" >/dev/null 2>&1 || true
fi

"$INSTALLED" autostart enable

if [ "$NO_START" -eq 0 ]; then
  "$INSTALLED" daemon >/dev/null 2>&1 &
  sleep 1
fi

cat <<EOF

Installed Funnel Intake
  Binary : $INSTALLED
  Config : $CONFIG
  Log    : $LOG
  Hotkey : $HOTKEY
  URL    : $URL

Select text in Teams, Outlook or a browser and press $HOTKEY.
Open settings with: "$INSTALLED" settings
Remove it with:     "$0" --uninstall

The first capture asks for Accessibility permission:
  System Settings > Privacy & Security > Accessibility > add Funnel Intake.
EOF
