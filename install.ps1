# install.ps1 - Install/update/remove MedFam as a Windows Service.
#
# The Windows counterpart to install.sh (which targets the Pi/Linux). Lets you
# run the MedFam backend + tablet PWA on a Windows PC instead of a Raspberry
# Pi -- the PC just needs to stay on and reachable on your LAN, same as the Pi
# would.
#
# Usage (run from an elevated PowerShell, from the root of a MedFam clone):
#   .\install.ps1                                   # fresh install, prompts for port/timezone
#   .\install.ps1 -Port 8093 -Timezone America/Toronto   # fresh install, no prompts
#   .\install.ps1 -Update                            # git pull, rebuild, restart the service
#   .\install.ps1 -Update -SkipPwaBuild              # backend-only update
#   .\install.ps1 -Uninstall                         # stop and remove the service

param(
    [int]$Port,
    [string]$Timezone,
    [switch]$Update,
    [switch]$Uninstall,
    [switch]$SkipPwaBuild
)

$ErrorActionPreference = 'Stop'
$RepoRoot = $PSScriptRoot
$ServiceName = 'MedFam'
$PortExplicit = $PSBoundParameters.ContainsKey('Port')
$TimezoneExplicit = $PSBoundParameters.ContainsKey('Timezone')

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }
function Write-Warn2($msg) { Write-Host "[WARNING] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Assert-Admin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Err "This script needs to install/manage a Windows Service, which requires Administrator."
        Write-Err "Right-click PowerShell -> 'Run as Administrator', then re-run .\install.ps1 from $RepoRoot."
        exit 1
    }
}

function Get-NodeMajorVersion {
    try { return [int](node -e "console.log(process.versions.node.split('.')[0])" 2>$null) }
    catch { return 0 }
}

function Assert-Node {
    $hasNode = Get-Command node -ErrorAction SilentlyContinue
    if ($hasNode -and (Get-NodeMajorVersion) -ge 18) { return }

    Write-Step "Node.js 18+ not found -- attempting to install via winget..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-Err "winget isn't available either. Install Node.js 18+ LTS manually from https://nodejs.org,"
        Write-Err "then re-open PowerShell as Administrator and re-run .\install.ps1."
        exit 1
    }
    winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    Write-Warn2 "Node.js was just installed -- close this window, re-open PowerShell as Administrator, and re-run .\install.ps1 so PATH picks it up."
    exit 0
}

function Get-DetectedTimezone {
    try {
        $tz = node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)" 2>$null
        if ($tz) { return $tz.Trim() }
    } catch {}
    return 'America/Toronto'
}

function Assert-PortFree([int]$port) {
    $ours = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($ours) { return } # updating/reinstalling our own service -- its own listener doesn't count
    $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($inUse) {
        Write-Err "Port $port is already in use by something else. Pick a different one with -Port N."
        exit 1
    }
}

function Invoke-Uninstall {
    Write-Step "Removing the MedFam service..."
    Push-Location (Join-Path $RepoRoot 'windows-service')
    try {
        if (-not (Test-Path 'node_modules')) { npm install }
        node uninstall-service.js
    } finally { Pop-Location }

    $rule = Get-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue
    if ($rule) {
        Write-Step "Removing the Windows Firewall rule..."
        Remove-NetFirewallRule -DisplayName $ServiceName
    }
    Write-Host "`nMedFam service removed. Your data in .\data\medfam.db was left untouched." -ForegroundColor Green
    exit 0
}

function Get-LanAddresses {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -ExpandProperty IPAddress
}

function Get-ServicePort([int]$default) {
    # node-windows writes the env vars we passed at install time into
    # daemon\medfam.xml; used only to know which port to health-check after
    # an -Update restart when the caller didn't pass -Port explicitly.
    $xmlPath = Join-Path $RepoRoot 'daemon\medfam.xml'
    if (-not (Test-Path $xmlPath)) { return $default }
    try {
        $xml = [xml](Get-Content $xmlPath -Raw)
        $portNode = $xml.service.env | Where-Object { $_.name -eq 'PORT' }
        if ($portNode) { return [int]$portNode.value }
    } catch {}
    return $default
}

function Wait-ForHealth([int]$port) {
    Write-Step "Waiting for MedFam to come up..."
    for ($i = 0; $i -lt 10; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:$port/api/health" -TimeoutSec 2 -ErrorAction Stop
            if ($resp.status -eq 'ok') { Write-Host "MedFam is up." -ForegroundColor Green; return $true }
        } catch { Start-Sleep -Seconds 1 }
    }
    Write-Warn2 "MedFam did not respond on port $port after 10s."
    Write-Warn2 "Check status with: Get-Service $ServiceName ; and logs under .\daemon\*.log"
    return $false
}

# ── main ─────────────────────────────────────────────────────────────────
Assert-Admin

if ($Uninstall) { Invoke-Uninstall }

if ($Update) {
    Write-Step "Updating MedFam..."
    if (Test-Path (Join-Path $RepoRoot '.git')) {
        git -C $RepoRoot pull
    } else {
        Write-Warn2 "No .git folder found -- skipping git pull. Re-download/replace this folder yourself if you need newer source, then re-run -Update."
    }

    Assert-Node
    Write-Step "Installing API dependencies..."
    Push-Location $RepoRoot
    npm install --omit=dev
    Pop-Location

    if (-not $SkipPwaBuild) {
        Write-Step "Building the tablet PWA..."
        Push-Location (Join-Path $RepoRoot 'pwa')
        npm install
        npm run build
        Pop-Location
    }

    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Err "No MedFam service is installed yet. Run .\install.ps1 (without -Update) first."
        exit 1
    }
    Write-Step "Restarting the MedFam service..."
    Restart-Service -Name $ServiceName
    $healthPort = if ($Port) { $Port } else { Get-ServicePort -default 8093 }
    Wait-ForHealth -port $healthPort | Out-Null
    Write-Host "`nUpdate complete." -ForegroundColor Green
    exit 0
}

# Fresh install
Assert-Node

if (-not $PortExplicit) {
    $answer = Read-Host "Port to listen on [8093]"
    $Port = if ($answer) { [int]$answer } else { 8093 }
} elseif (-not $Port) {
    $Port = 8093
}

if (-not $TimezoneExplicit) {
    $detected = Get-DetectedTimezone
    $answer = Read-Host "Timezone, IANA name [$detected]"
    $Timezone = if ($answer) { $answer } else { $detected }
} elseif (-not $Timezone) {
    $Timezone = Get-DetectedTimezone
}

Assert-PortFree -port $Port

Write-Step "Installing API dependencies (better-sqlite3 uses a prebuilt Windows binary -- no build tools needed in the common case)..."
Push-Location $RepoRoot
npm install --omit=dev
if ($LASTEXITCODE -ne 0) { Write-Err "npm install failed."; exit 1 }
Pop-Location

if (-not $SkipPwaBuild) {
    Write-Step "Building the tablet PWA..."
    Push-Location (Join-Path $RepoRoot 'pwa')
    npm install
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Err "PWA build failed."; exit 1 }
    Pop-Location
}

$dbPath = Join-Path $RepoRoot 'data\medfam.db'
if (-not (Test-Path $dbPath)) {
    $answer = Read-Host "Populate sample demo data (2 people, meds, doctors, appointments)? [y/N]"
    if ($answer -match '^(y|yes)$') {
        Push-Location $RepoRoot
        npm run seed
        Pop-Location
    }
}

Write-Step "Registering the MedFam Windows Service..."
Push-Location (Join-Path $RepoRoot 'windows-service')
npm install
node install-service.js "--port=$Port" "--timezone=$Timezone"
if ($LASTEXITCODE -ne 0) { Write-Err "Service install failed."; Pop-Location; exit 1 }
Pop-Location

Write-Step "Opening Windows Firewall for port $Port..."
$existingRule = Get-NetFirewallRule -DisplayName $ServiceName -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Info "A '$ServiceName' firewall rule already exists -- leaving it as-is."
} else {
    try {
        New-NetFirewallRule -DisplayName $ServiceName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
        Write-Info "Inbound TCP $Port allowed."
    } catch {
        Write-Warn2 "Couldn't add a firewall rule automatically ($($_.Exception.Message)). Add one manually if the tablet can't reach this PC:"
        Write-Warn2 "  New-NetFirewallRule -DisplayName MedFam -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow"
    }
}

Wait-ForHealth -port $Port | Out-Null

$lanIps = Get-LanAddresses
$urlList = ($lanIps | ForEach-Object { "http://$($_):$Port" }) -join "`n              "

Write-Host ""
Write-Host "MedFam is installed and running as a Windows Service." -ForegroundColor Green
Write-Host ""
Write-Host "  Install dir : $RepoRoot"
Write-Host "  Service     : $ServiceName (Get-Service $ServiceName / Restart-Service $ServiceName)"
Write-Host "  Port        : $Port"
Write-Host "  Timezone    : $Timezone"
Write-Host "  URL(s)      : $urlList"
Write-Host ""
Write-Host "MedFam has no login. Do not expose this port to the public internet -- put it" -ForegroundColor Yellow
Write-Host "behind Tailscale/WireGuard, or keep this PC on your private LAN only." -ForegroundColor Yellow
Write-Host ""
Write-Host "On the tablet: open one of the URLs above in the browser. On the MedFam Admin" -ForegroundColor Gray
Write-Host "desktop app: Settings -> Server Address -> the same URL." -ForegroundColor Gray
Write-Host ""
Write-Host "This PC needs to stay powered on (Settings -> Power -> disable sleep) for MedFam" -ForegroundColor Gray
Write-Host "to be reachable -- the service itself starts automatically at boot regardless of login." -ForegroundColor Gray
Write-Host ""
Write-Host "The tablet PWA's offline/install features need HTTPS (plain HTTP over a LAN IP" -ForegroundColor Gray
Write-Host "won't register a service worker). If you're on Tailscale, run this once to fix" -ForegroundColor Gray
Write-Host "that and make MedFam reachable from anywhere on your tailnet, not just your LAN:" -ForegroundColor Gray
Write-Host "  $RepoRoot\scripts\tailscale-serve.ps1 -Port $Port" -ForegroundColor Gray
Write-Host ""
Write-Host "To update later: .\install.ps1 -Update" -ForegroundColor Gray
Write-Host "To remove:       .\install.ps1 -Uninstall" -ForegroundColor Gray
