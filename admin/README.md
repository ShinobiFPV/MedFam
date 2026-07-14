# MedFam Admin

A Windows desktop app (Electron + React + TypeScript) for managing MedFam profiles,
medications, doctors, and appointments, plus a dose-compliance history view. It's a
separate client of the same REST API the tablet PWA uses — point it at your MedFam
server's address and it manages that server's data directly. No login (matches the
rest of MedFam's network-perimeter-trust model); whoever can reach your server can use
this app against it.

## Dev mode

```powershell
npm install
npm run dev
```

Opens the app pointed at whatever server address is saved locally (or the first-run
setup screen if none is set yet). Point it at a MedFam backend — either your own Pi
(`http://192.168.1.203:8093` or similar) or a local instance (`cd .. && npm run dev`
from the root project, and use `http://localhost:8093` here).

## Build

```powershell
npm run typecheck   # tsc -b across main/preload/renderer
npm run build        # same, then electron-vite build -> out/
npm run dist          # build, then electron-builder --win (unpublished, local .exe in dist/)
npm run generate-icon # regenerate build/icon.ico (only needed if you change the design)
```

## Release

Releases are manual (no CI/CD pipeline) and publish to the same GitHub repo's Releases,
which is also where `electron-updater`'s "check for updates" looks:

```powershell
$env:GH_TOKEN = "<a GitHub personal access token with repo scope>"
npm run release   # build, then electron-builder --win --publish always
```

This uploads the installer `.exe` plus the `latest.yml` metadata file
electron-updater needs. Bump `version` in `package.json` before releasing — that
version is what gets compared against what's currently installed.

## Architecture notes

- `src/main/` — Electron main process: window lifecycle, the auto-update check
  (`electron-updater`, "check and notify" — downloads in the background if a newer
  release exists, prompts to restart to apply; nothing is applied silently), and IPC
  handlers for the locally-stored server address (`src/main/store.ts`, via
  `electron-store`).
- `src/preload/` — a minimal `contextBridge` surface (`window.medfam`) exposing exactly
  those IPC calls to the renderer; `contextIsolation` is on and `nodeIntegration` is
  off.
- `src/renderer/src/` — the React app. `api/client.ts` mirrors `pwa/src/api/client.ts`'s
  shape (same error handling, same endpoint surface) but resolves its base URL from
  the stored server address instead of using relative `/api` paths, since this isn't
  same-origin like the PWA.
- CORS: the backend (`../src/app.js`) needed a small permissive CORS middleware added
  for this app to be able to fetch cross-origin at all — see that file's comment.
