# MedFam — shinobi Pi setup notes (author reference)

> **Installing MedFam on your own machine?** See the main [README](./README.md)'s
> Quick Install (`install.sh`) instead — this file documents the author's own specific
> Pi (`shinobi`, port 8093) and his personal `deploy.ps1` push-based workflow from a
> Windows dev machine, not the general public install path.

These steps are run once on `shinobi` (192.168.1.203) to get MedFam installed as a
systemd service on port **8093**. After this, `.\deploy.ps1 -restart` from Windows
handles day-to-day updates.

## 1. Prerequisites on the Pi

Node.js LTS should already be present (used by the other ShinTech services on
8091/8092). Confirm:

```bash
node --version   # v18+ expected
npm --version
```

If missing, install Node LTS via [NodeSource](https://github.com/nodesource/distributions)
or `nvm` before continuing.

## 2. First sync

From Windows, in the project root:

```powershell
.\deploy.ps1
```

This builds the tablet PWA locally (`pwa/`, requires `npm install` there once first —
see the root README's "Tablet PWA" section), then copies the project to
`/home/shinobi/medfam/` (excluding `node_modules/`, `data/`, and `pwa/`'s own source —
only `pwa/dist` is shipped) and runs `npm install --omit=dev` on the Pi for the API's
own dependencies. `better-sqlite3` will compile its native binding for the Pi's ARM64
architecture during this step — expect it to take a minute or two the first time.

## 3. Seed sample data (optional, recommended for Phase 2 dev)

```bash
ssh shinobi
cd /home/shinobi/medfam
npm run seed
```

## 4. Install the systemd unit

```bash
ssh shinobi
sudo cp /home/shinobi/medfam/medfam.service /etc/systemd/system/medfam.service
sudo systemctl daemon-reload
sudo systemctl enable medfam
sudo systemctl start medfam
```

Check it's up:

```bash
systemctl status medfam
curl http://localhost:8093/api/health
```

## 5. Networking note

MedFam listens standalone on port **8093** — no nginx location block is required.
Access is over Tailscale only for Phase 1 (same model as the 8091/8092 services), so
there's no reverse proxy to configure for plain access — `shinobi`'s Tailscale IP or
MagicDNS name on port 8093 is reachable from any device on the tailnet, whether it's
on the home LAN or out and about. If you later want it behind the existing nginx setup
instead of a bare port, add something like:

```nginx
location /medfam/ {
    proxy_pass http://127.0.0.1:8093/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

...and reload nginx (`sudo systemctl reload nginx`). Not needed by default.

**HTTPS, for full offline/install support:** the PWA's service worker (offline
caching, "Add to Home Screen") only registers in a secure context — HTTPS or
`localhost`. Plain HTTP over a Tailscale IP does not qualify, so none of the
offline/installable behavior works on the tablets until the origin is HTTPS. Run this
once (requires MagicDNS + "HTTPS Certificates" enabled for the tailnet — see
https://tailscale.com/kb/1153/enabling-https):

```bash
cd /home/shinobi/medfam
./scripts/tailscale-serve.sh 8093
```

This uses `tailscale serve` to reverse-proxy `https://shinobi.<tailnet>.ts.net` (port
443, tailnet-only — nothing is exposed publicly) to `localhost:8093`. Tailscale
issues and renews the certificate itself and the config survives reboots, so it's a
one-time step. Point tablets and the Admin app's Server Address at that `https://` URL
instead of the raw `http://<tailscale-ip>:8093`. Not needed just to use the API or
view the PWA online — only for offline/install.

## 6. Ongoing deploys

```powershell
.\deploy.ps1 -restart
```

Migrations in `migrations/` are applied automatically on service start — no manual
migration step needed. If you changed `medfam.service` itself, re-copy it and
`daemon-reload` as shown in step 4 (`deploy.ps1` will remind you if it detects that
file changed).
