#!/usr/bin/env bash
# MedFam installer — installs Node if needed, clones/updates MedFam, builds the
# tablet PWA, installs dependencies, and sets up a systemd service.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ShinobiFPV/MedFam/master/install.sh | bash
#   ./install.sh [--dir=PATH] [--user=NAME] [--port=N] [--timezone=Area/City] [--update]
#
# Targets Debian-based Linux (Raspberry Pi OS, Debian, Ubuntu).
set -euo pipefail

REPO_URL="https://github.com/ShinobiFPV/MedFam.git"
NODE_MAJOR="20"

MEDFAM_DIR="$HOME/medfam"
MEDFAM_USER="${SUDO_USER:-$(whoami)}"
MEDFAM_PORT="8093"
MEDFAM_TIMEZONE=""
UPDATE_MODE=false

USER_EXPLICIT=false
PORT_EXPLICIT=false
TZ_EXPLICIT=false

usage() {
  cat <<'EOF'
Usage: install.sh [options]

  --dir=PATH             Install directory (default: $HOME/medfam)
  --user=NAME            System user to run the service as (default: current user)
  --port=N               Port to listen on (default: 8093)
  --timezone=Area/City   IANA timezone, e.g. America/Toronto (default: auto-detected)
  --update               Update an existing install in place
  -h, --help             Show this help
EOF
}

# Pass 1: just enough to know where an existing install (and its saved config)
# would live, before we decide what the *other* defaults should be.
for arg in "$@"; do
  case "$arg" in
    --dir=*) MEDFAM_DIR="${arg#*=}" ;;
    --update) UPDATE_MODE=true ;;
    -h|--help) usage; exit 0 ;;
  esac
done

CONF_FILE="$MEDFAM_DIR/.medfam-install.conf"
if [ "$UPDATE_MODE" = true ] && [ -f "$CONF_FILE" ]; then
  echo "Loading saved config from $CONF_FILE"
  # shellcheck disable=SC1090
  source "$CONF_FILE"
fi

# Pass 2: this run's explicit flags win over whatever we now have (defaults,
# or values just loaded from a previous install's saved config).
for arg in "$@"; do
  case "$arg" in
    --dir=*) MEDFAM_DIR="${arg#*=}" ;;
    --user=*) MEDFAM_USER="${arg#*=}"; USER_EXPLICIT=true ;;
    --port=*) MEDFAM_PORT="${arg#*=}"; PORT_EXPLICIT=true ;;
    --timezone=*) MEDFAM_TIMEZONE="${arg#*=}"; TZ_EXPLICIT=true ;;
    --update) UPDATE_MODE=true ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Reads a prompt from the controlling terminal even when stdin is a curl pipe.
# Silently falls back to the default if no terminal is available at all (e.g.
# a fully non-interactive/CI run) — /dev/tty can pass a plain -r test yet
# still fail to open with ENXIO when there's no controlling terminal at all,
# so the failure is suppressed rather than just the read's own exit status.
prompt_default() {
  local question="$1" default="$2" answer=""
  if [ -r /dev/tty ]; then
    { read -r -p "$question [$default]: " answer </dev/tty; } 2>/dev/null || true
  fi
  echo "${answer:-$default}"
}

require_linux() {
  if [ "$(uname -s)" != "Linux" ]; then
    echo "ERROR: this installer targets Debian-based Linux (e.g. Raspberry Pi OS)." >&2
    echo "Detected: $(uname -s)" >&2
    exit 1
  fi
}

ensure_prereqs() {
  local missing=()
  command -v curl >/dev/null 2>&1 || missing+=(curl)
  command -v git >/dev/null 2>&1 || missing+=(git)
  if [ ${#missing[@]} -eq 0 ]; then
    return 0
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: missing required tools: ${missing[*]}. Install them and re-run." >&2
    exit 1
  fi
  echo "Installing missing prerequisites: ${missing[*]}"
  sudo apt-get update -y
  sudo apt-get install -y "${missing[@]}"
}

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
  [ "$major" -ge 18 ] 2>/dev/null
}

install_node() {
  echo "Installing Node.js ${NODE_MAJOR}.x via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
}

detect_timezone() {
  local tz=""
  if command -v timedatectl >/dev/null 2>&1; then
    tz="$(timedatectl show --property=Timezone --value 2>/dev/null || true)"
  fi
  if [ -z "$tz" ] && [ -f /etc/timezone ]; then
    tz="$(cat /etc/timezone 2>/dev/null || true)"
  fi
  echo "${tz:-America/Toronto}"
}

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[.:]${port}\$"
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[.:]${port}\$"
  else
    return 1 # can't check; assume free
  fi
}

check_port() {
  local port="$1"
  if port_in_use "$port" && ! systemctl is-active --quiet medfam 2>/dev/null; then
    echo "ERROR: port $port is already in use by something else. Choose a different port with --port=N." >&2
    exit 1
  fi
}

fetch_medfam() {
  if [ -d "$MEDFAM_DIR/.git" ]; then
    echo "Existing install found at $MEDFAM_DIR — updating..."
    git -C "$MEDFAM_DIR" fetch --depth 1 origin master
    git -C "$MEDFAM_DIR" reset --hard origin/master
  elif [ -e "$MEDFAM_DIR" ]; then
    echo "ERROR: $MEDFAM_DIR already exists and isn't a MedFam checkout. Use a different --dir or remove it first." >&2
    exit 1
  else
    echo "Cloning MedFam into $MEDFAM_DIR..."
    mkdir -p "$(dirname "$MEDFAM_DIR")"
    git clone --depth 1 "$REPO_URL" "$MEDFAM_DIR"
  fi
}

build_medfam() {
  echo "Installing API dependencies (compiling better-sqlite3's native binding — this can take a minute or two)..."
  (cd "$MEDFAM_DIR" && npm install --omit=dev)

  echo "Building the tablet PWA..."
  (cd "$MEDFAM_DIR/pwa" && npm install && npm run build)
}

maybe_seed() {
  if [ "$UPDATE_MODE" = true ] || [ -f "$MEDFAM_DIR/data/medfam.db" ]; then
    return 0
  fi
  local answer
  answer="$(prompt_default "Populate sample demo data (2 people, meds, doctors, appointments)? [y/N]" "N")"
  case "$answer" in
    y|Y|yes|Yes) (cd "$MEDFAM_DIR" && npm run seed) ;;
    *) : ;;
  esac
}

write_conf() {
  cat > "$MEDFAM_DIR/.medfam-install.conf" <<EOF
MEDFAM_DIR="$MEDFAM_DIR"
MEDFAM_USER="$MEDFAM_USER"
MEDFAM_PORT="$MEDFAM_PORT"
MEDFAM_TIMEZONE="$MEDFAM_TIMEZONE"
EOF
}

install_service() {
  local tmp
  tmp="$(mktemp)"
  sed \
    -e "s|__MEDFAM_USER__|$MEDFAM_USER|g" \
    -e "s|__MEDFAM_DIR__|$MEDFAM_DIR|g" \
    -e "s|__MEDFAM_PORT__|$MEDFAM_PORT|g" \
    -e "s|__MEDFAM_TIMEZONE__|$MEDFAM_TIMEZONE|g" \
    "$MEDFAM_DIR/medfam.service.template" > "$tmp"
  sudo cp "$tmp" /etc/systemd/system/medfam.service
  rm -f "$tmp"
  sudo systemctl daemon-reload
  sudo systemctl enable medfam
  sudo systemctl restart medfam
}

verify_service() {
  echo "Waiting for MedFam to come up..."
  for _ in $(seq 1 10); do
    if curl -sf "http://localhost:${MEDFAM_PORT}/api/health" >/dev/null 2>&1; then
      echo "MedFam is up."
      return 0
    fi
    sleep 1
  done
  echo "WARNING: MedFam did not respond on port ${MEDFAM_PORT} after 10s." >&2
  echo "Check logs with: sudo journalctl -u medfam -n 50" >&2
  return 1
}

main() {
  require_linux
  ensure_prereqs
  if ! node_ok; then
    install_node
  fi

  if [ "$UPDATE_MODE" = false ]; then
    if [ "$USER_EXPLICIT" != true ]; then
      MEDFAM_USER="$(prompt_default "System user to run MedFam as" "$MEDFAM_USER")"
    fi
    if ! id "$MEDFAM_USER" >/dev/null 2>&1; then
      echo "ERROR: user '$MEDFAM_USER' does not exist. Create it first, or pass --user=<existing-user>." >&2
      exit 1
    fi
    if [ "$PORT_EXPLICIT" != true ]; then
      MEDFAM_PORT="$(prompt_default "Port to listen on" "$MEDFAM_PORT")"
    fi
    if [ "$TZ_EXPLICIT" != true ]; then
      MEDFAM_TIMEZONE="$(prompt_default "Timezone (IANA name)" "$(detect_timezone)")"
    fi
  fi
  MEDFAM_TIMEZONE="${MEDFAM_TIMEZONE:-America/Toronto}"

  check_port "$MEDFAM_PORT"
  fetch_medfam
  build_medfam
  maybe_seed
  write_conf
  install_service
  verify_service || true

  cat <<SUMMARY

MedFam is installed.

  Install dir : $MEDFAM_DIR
  Running as  : $MEDFAM_USER
  Port        : $MEDFAM_PORT
  Timezone    : $MEDFAM_TIMEZONE
  URL         : http://localhost:${MEDFAM_PORT}

MedFam has no login. Do not expose this port to the public internet — put it
behind Tailscale, WireGuard, or keep it on your private LAN only.

The tablet PWA's offline/install features need HTTPS to work (plain HTTP
won't register a service worker) — see the README for a "tailscale cert"
based setup if you want that.

To update later: install.sh --update
SUMMARY
}

main
