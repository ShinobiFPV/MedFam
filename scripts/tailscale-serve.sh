#!/usr/bin/env bash
# Exposes MedFam over HTTPS on your own tailnet via `tailscale serve`, so the
# tablet PWA's offline/install features (which need a secure context) also
# work away from home over Tailscale, not just on your home LAN.
#
# `tailscale serve` (without --funnel) only reverse-proxies within your own
# tailnet -- nothing is exposed to the public internet. Tailscale itself
# issues and renews the certificate, and the serve config persists across
# reboots, so this only needs to be run once.
#
# Prerequisites: MagicDNS and "HTTPS Certificates" enabled for your tailnet
# (https://tailscale.com/kb/1153/enabling-https).
#
# The second argument is the HTTPS port `tailscale serve` listens on (default
# 443, the standard HTTPS port). Override it if 443 is already claimed by
# another `tailscale serve`/`funnel` target on this host -- check first with
# `tailscale serve status`.
#
# Usage: ./scripts/tailscale-serve.sh [backend-port] [https-port]
set -euo pipefail

PORT="${1:-8093}"
HTTPS_PORT="${2:-443}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "ERROR: tailscale CLI not found. Install Tailscale first: https://tailscale.com/download" >&2
  exit 1
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "ERROR: tailscale doesn't appear to be running/logged in. Run 'tailscale up' first." >&2
  exit 1
fi

echo "Enabling HTTPS on your tailnet for MedFam (:${HTTPS_PORT} -> localhost:${PORT})..."
sudo tailscale serve --bg --https="${HTTPS_PORT}" "http://localhost:${PORT}"

echo
tailscale serve status
echo
echo "MedFam Admin and the tablet browser can now use the https:// URL above from"
echo "anywhere on your tailnet -- not just your home LAN. This only needs to be run"
echo "once: tailscaled keeps the serve config and renews the certificate on its own."
echo
echo "To undo: sudo tailscale serve --https=${HTTPS_PORT} off"
