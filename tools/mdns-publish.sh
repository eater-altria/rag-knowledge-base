#!/usr/bin/env bash
# Broadcast `rag.local` on the LAN via mDNS so any device on the same
# network can reach the RAG service by name (no /etc/hosts editing needed).
#
# Run this on the *server* machine (the one hosting `make up`). Keep it
# running — Ctrl+C stops the broadcast.
#
# Usage:
#   ./tools/mdns-publish.sh                    # default hostname=rag, port=3000
#   ./tools/mdns-publish.sh my-rag 8080        # custom name + port
#
# Verify from another LAN device:
#   ping rag.local
#   curl http://rag.local:3000/api/health

set -euo pipefail

NAME="${1:-rag}"
PORT="${2:-3000}"
OS="$(uname -s)"

echo "[mdns] broadcasting ${NAME}.local on port ${PORT} (Ctrl+C to stop)"

case "$OS" in
  Darwin)
    # macOS — dns-sd is built in. -P registers both an SRV record for the
    # service AND an A record for the hostname pointing at the given IP.
    # Auto-detect the primary LAN IPv4 (Wi-Fi first, then any en* interface).
    IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -z "${IP}" ]]; then
      IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
    fi
    if [[ -z "${IP}" ]]; then
      IP="$(ifconfig | awk '/inet /&&$2!="127.0.0.1"{print $2;exit}')"
    fi
    if [[ -z "${IP}" ]]; then
      echo "[mdns] could not detect LAN IP" >&2
      exit 1
    fi
    echo "[mdns] mapping ${NAME}.local -> ${IP}"
    exec dns-sd -P "${NAME}" _http._tcp local "${PORT}" "${NAME}.local" "${IP}"
    ;;

  Linux)
    if ! command -v avahi-publish >/dev/null 2>&1; then
      cat <<EOF >&2
[mdns] avahi-publish not found. Install it first:
  sudo apt install avahi-utils      # Debian/Ubuntu
  sudo dnf install avahi-tools      # Fedora/RHEL
And make sure avahi-daemon is running:
  sudo systemctl enable --now avahi-daemon
EOF
      exit 1
    fi
    # Detect primary LAN IP (first non-loopback IPv4)
    IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [[ -z "${IP}" ]]; then
      echo "[mdns] could not detect LAN IP" >&2
      exit 1
    fi
    echo "[mdns] mapping ${NAME}.local -> ${IP}"
    # -a publishes an address record; runs in foreground
    exec avahi-publish -a "${NAME}.local" "${IP}"
    ;;

  *)
    cat <<EOF >&2
[mdns] unsupported OS: $OS
On Windows: install Bonjour Print Services from Apple, then run this on a
macOS/Linux machine — or use the /etc/hosts fallback (see skill/README.md).
EOF
    exit 1
    ;;
esac
