#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Knot Code — Development Setup & Run
# ──────────────────────────────────────────────────────────────
#
# Usage:
#   ./scripts/dev.sh              # Web dev server (default)
#   ./scripts/dev.sh web          # Web dev server
#   ./scripts/dev.sh desktop      # Desktop (Tauri) dev
#   ./scripts/dev.sh setup        # First-time setup only
#   ./scripts/dev.sh clean        # Clean caches and rebuild
#
# Prerequisites:
#   - Node.js >= 20
#   - pnpm (npm i -g pnpm)
#   - Rust toolchain (for desktop only): https://rustup.rs
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${CYAN}  ▸${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; }

# ── Preflight checks ──────────────────────────────────────────
check_prereqs() {
  log "Checking prerequisites…"

  if ! command -v node &>/dev/null; then
    err "Node.js not found. Install from https://nodejs.org (v20+)"
    exit 1
  fi

  NODE_V=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_V" -lt 20 ]; then
    err "Node.js v20+ required (found v$(node -v))"
    exit 1
  fi
  ok "Node.js $(node -v)"

  if ! command -v pnpm &>/dev/null; then
    warn "pnpm not found — installing globally…"
    npm i -g pnpm
  fi
  ok "pnpm $(pnpm -v)"

  if [ "${1:-}" = "desktop" ]; then
    if ! command -v rustc &>/dev/null; then
      err "Rust not found. Install from https://rustup.rs"
      exit 1
    fi
    ok "Rust $(rustc --version | awk '{print $2}')"

    if ! command -v cargo-tauri &>/dev/null && ! pnpm tauri --version &>/dev/null 2>&1; then
      warn "Tauri CLI not found — will use pnpm tauri"
    fi
  fi
}

# ── Environment ────────────────────────────────────────────────
setup_env() {
  if [ ! -f .env ]; then
    if [ -f .env.example ]; then
      cp .env.example .env
      warn "Created .env from .env.example — edit it with your values"
    else
      warn "No .env file found"
    fi
  else
    ok ".env exists"
  fi
}

# ── Install dependencies ──────────────────────────────────────
install_deps() {
  log "Installing dependencies…"
  pnpm install
  ok "Dependencies installed"
}

# ── Clean ──────────────────────────────────────────────────────
clean() {
  log "Cleaning caches…"
  rm -rf .next out node_modules/.cache
  ok "Cleaned .next, out, and node_modules/.cache"
}

# ── Setup (first-time) ────────────────────────────────────────
setup() {
  echo -e "\n${BOLD}🔧 Knot Code — First-Time Setup${NC}\n"
  check_prereqs "${1:-web}"
  setup_env
  install_deps
  echo -e "\n${GREEN}${BOLD}  Setup complete!${NC}\n"
  echo "  Next steps:"
  echo "    1. Edit .env with your GitHub OAuth Client ID (optional)"
  echo "    2. Run: ./scripts/dev.sh"
  echo ""
}

# ── Dev: Web ───────────────────────────────────────────────────
dev_web() {
  echo -e "\n${BOLD}🌐 Knot Code — Web Dev Server${NC}\n"
  check_prereqs web
  setup_env
  install_deps

  echo ""
  log "Starting Next.js dev server (Turbopack)…"
  echo -e "  ${CYAN}→${NC} http://localhost:3000"
  echo -e "  ${CYAN}→${NC} Press Ctrl+C to stop\n"

  pnpm dev
}

# ── Dev: Desktop ──────────────────────────────────────────────
dev_desktop() {
  echo -e "\n${BOLD}🖥  Knot Code — Desktop Dev (Tauri)${NC}\n"
  check_prereqs desktop
  setup_env
  install_deps

  echo ""
  log "Starting Tauri dev mode…"
  echo -e "  ${CYAN}→${NC} Next.js dev server + Tauri window"
  echo -e "  ${CYAN}→${NC} Hot-reload enabled for both web & native"
  echo -e "  ${CYAN}→${NC} Press Ctrl+C to stop\n"

  pnpm tauri:dev
}

# ── Main ──────────────────────────────────────────────────────
TARGET="${1:-web}"

case "$TARGET" in
  setup)     setup "${2:-web}" ;;
  clean)     clean ;;
  web)       dev_web ;;
  desktop)   dev_desktop ;;
  *)
    echo "Usage: ./scripts/dev.sh [web|desktop|setup|clean]"
    exit 1
    ;;
esac
