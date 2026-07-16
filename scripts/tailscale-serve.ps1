# Exposes MedFam over HTTPS on your own tailnet via `tailscale serve`, so the
# tablet PWA's offline/install features (which need a secure context) also
# work away from home over Tailscale, not just on your home LAN.
#
# `tailscale serve` (without -Funnel) only reverse-proxies within your own
# tailnet -- nothing is exposed to the public internet. Tailscale itself
# issues and renews the certificate, and the serve config persists across
# reboots, so this only needs to be run once.
#
# Prerequisites: MagicDNS and "HTTPS Certificates" enabled for your tailnet
# (https://tailscale.com/kb/1153/enabling-https).
#
# -HttpsPort is the port `tailscale serve` listens on (default 443, the
# standard HTTPS port). Override it if 443 is already claimed by another
# `tailscale serve`/`funnel` target on this host -- check first with
# `tailscale serve status`.
#
# Usage: .\scripts\tailscale-serve.ps1 [-Port 8093] [-HttpsPort 443]

param(
    [int]$Port = 8093,
    [int]$HttpsPort = 443
)

$ErrorActionPreference = 'Stop'

$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscale) {
    Write-Host "[ERROR] tailscale CLI not found. Install Tailscale first: https://tailscale.com/download" -ForegroundColor Red
    exit 1
}

& tailscale status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] tailscale doesn't appear to be running/logged in. Run 'tailscale up' first." -ForegroundColor Red
    exit 1
}

Write-Host "Enabling HTTPS on your tailnet for MedFam (:$HttpsPort -> localhost:$Port)..." -ForegroundColor Cyan
& tailscale serve --bg --https=$HttpsPort "http://localhost:$Port"

Write-Host ""
& tailscale serve status
Write-Host ""
Write-Host "MedFam Admin and the tablet browser can now use the https:// URL above from" -ForegroundColor Gray
Write-Host "anywhere on your tailnet -- not just your home LAN. This only needs to be run" -ForegroundColor Gray
Write-Host "once: tailscaled keeps the serve config and renews the certificate on its own." -ForegroundColor Gray
Write-Host ""
Write-Host "To undo: tailscale serve --https=$HttpsPort off" -ForegroundColor Gray
