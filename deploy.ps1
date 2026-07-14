# deploy.ps1 — Build the PWA, sync MedFam to shinobi, install deps, and restart the service
# Usage: .\deploy.ps1 [-restart] [-dryrun] [-skipPwaBuild]
#
# Prerequisites:
#   - SSH key auth configured (ssh shinobi should work passwordless)
#   - Run from the root of your local medfam clone
#   - node_modules and data/ are NOT synced: better-sqlite3 is a native module
#     that must be built on the Pi's own architecture, and data/ holds the
#     live production database that must never be overwritten from a dev copy.
#   - pwa/ is built locally first; only pwa/dist (the static output Express
#     serves at '/') is shipped — not pwa/node_modules or pwa/src, which the
#     Pi never needs since the PWA is plain static files at runtime.

param(
    [switch]$restart,
    [switch]$dryrun,
    [switch]$skipPwaBuild
)

# ── CONFIG ────────────────────────────────────────────────────────────────────
$REMOTE_HOST = "shinobi"
$REMOTE_USER = "shinobi"
$REMOTE_PATH = "/home/shinobi/medfam/"
$LOCAL_PATH  = $PSScriptRoot
$PWA_DIR     = Join-Path $LOCAL_PATH "pwa"
$PWA_DIST    = Join-Path $PWA_DIR "dist"

# Files/dirs to exclude from the general sync ('pwa' is handled separately below)
$EXCLUDES = @(
    ".git",
    ".gitignore",
    "node_modules",
    "data",
    "pwa",
    "*.bak",
    "*.bak.*"
)
# ─────────────────────────────────────────────────────────────────────────────

$ssh    = "C:\Windows\System32\OpenSSH\ssh.exe"
$scp    = "C:\Windows\System32\OpenSSH\scp.exe"
$target = "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}"

Write-Host ""
Write-Host "==> Deploying MedFam to shinobi..." -ForegroundColor Cyan
Write-Host "    From : $LOCAL_PATH"
Write-Host "    To   : $target"
Write-Host ""

if (-not $skipPwaBuild) {
    Write-Host "==> Building the PWA (pwa/)..." -ForegroundColor Cyan
    Push-Location $PWA_DIR
    npm run build
    $pwaBuildOk = ($LASTEXITCODE -eq 0)
    Pop-Location
    if (-not $pwaBuildOk) {
        Write-Host "[ERROR] PWA build failed. Aborting deploy." -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

if (-not (Test-Path $PWA_DIST)) {
    Write-Host "[ERROR] $PWA_DIST not found. Run 'npm run build' in pwa/ first, or pass -skipPwaBuild only if you know dist/ is already up to date." -ForegroundColor Red
    exit 1
}

if ($dryrun) {
    Write-Host "[DRY RUN] Would copy all files except: $($EXCLUDES -join ', ')" -ForegroundColor Yellow
    Write-Host "[DRY RUN] Would copy pwa/dist -> ${REMOTE_PATH}pwa/dist" -ForegroundColor Yellow
    Write-Host "[DRY RUN] No files will be transferred." -ForegroundColor Yellow
    exit 0
}

# Build list of top-level items to copy (everything except excludes)
$items = Get-ChildItem -Path $LOCAL_PATH | Where-Object {
    $name = $_.Name
    -not ($EXCLUDES | Where-Object { $name -eq $_ -or $name -like $_ })
}

if ($items.Count -eq 0) {
    Write-Host "[ERROR] No files found to sync in $LOCAL_PATH" -ForegroundColor Red
    exit 1
}

# Ensure remote directories exist
& $ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_PATH}pwa"

# Copy each top-level item (API source, migrations, package.json, etc.)
$success = $true
foreach ($item in $items) {
    Write-Host "  Copying $($item.Name)..." -ForegroundColor Gray
    if ($item.PSIsContainer) {
        & $scp -r $item.FullName "${target}"
    } else {
        & $scp $item.FullName "${target}"
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to copy $($item.Name)" -ForegroundColor Red
        $success = $false
    }
}

# Copy the PWA's built static output (pwa/dist -> remote pwa/dist)
Write-Host "  Copying pwa/dist..." -ForegroundColor Gray
& $scp -r $PWA_DIST "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}pwa/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to copy pwa/dist" -ForegroundColor Red
    $success = $false
}

if (-not $success) {
    Write-Host ""
    Write-Host "[ERROR] Some files failed to transfer." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==> Sync complete." -ForegroundColor Green

Write-Host ""
Write-Host "==> Installing dependencies on shinobi (npm install)..." -ForegroundColor Cyan
& $ssh "${REMOTE_USER}@${REMOTE_HOST}" "cd ${REMOTE_PATH} && npm install --omit=dev"
if ($LASTEXITCODE -eq 0) {
    Write-Host "==> npm install succeeded." -ForegroundColor Green
} else {
    Write-Host "[ERROR] npm install failed on shinobi." -ForegroundColor Red
    exit 1
}

# medfam.service in this repo is a reference copy of the installed
# unit at /etc/systemd/system/medfam.service -- syncing it into
# /home/shinobi/medfam/ (above) does NOT reinstall it. If you changed
# it, install it manually:
Write-Host ""
Write-Host "  NOTE: if medfam.service changed, install it manually:" -ForegroundColor DarkGray
Write-Host "  ssh shinobi 'sudo cp /home/shinobi/medfam/medfam.service /etc/systemd/system/ && sudo systemctl daemon-reload'" -ForegroundColor DarkGray

if ($restart) {
    Write-Host ""
    Write-Host "==> Restarting medfam service on shinobi..." -ForegroundColor Cyan
    & $ssh "${REMOTE_USER}@${REMOTE_HOST}" "sudo systemctl restart medfam"
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> Restart succeeded." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Restart failed via SSH." -ForegroundColor Red
    }
}

Write-Host ""
