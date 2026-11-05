#!/bin/sh
#
# Install Funnel as a systemd system service.
#
# This helper only validates the caller and runs the installer that ships in
# the Funnel executable. `funnel setup` owns the user, group, directories,
# environment file, systemd unit, and service startup; do not duplicate those
# steps here.
#
# Usage:
#   sudo packaging/systemd/install.sh [path-to-funnel-binary]
#
# Environment:
#   PORT  Listen port (default: 3000)

set -eu

BINARY="${1:-/usr/local/bin/funnel}"

if [ "$(id -u)" -ne 0 ]; then
  echo "error: run this as root, for example: sudo $0" >&2
  exit 1
fi

if [ ! -x "$BINARY" ]; then
  echo "error: Funnel binary not found or not executable: $BINARY" >&2
  echo "Install the release binary first, or pass its path: sudo $0 /path/to/funnel" >&2
  exit 1
fi

exec "$BINARY" setup \
  --mode system \
  --yes \
  --config-file /etc/funnel/funnel.env \
  --data-dir /var/lib/funnel \
  --log-dir /var/log/funnel \
  --port "${PORT:-3000}"
