#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Knot Code — Production Build & Release
# ──────────────────────────────────────────────────────────────
#
# Usage:
#   ./scripts/build-release.sh web              # Production build (web)
#   ./scripts/build-release.sh web --serve      # Build + serve locally
#   ./scripts/build-release.sh desktop          # Production build (macOS aarch64 DMG)
#   ./scripts/build-release.sh release 1.0.0    # Version bump + tag
#   ./scripts/build-release.sh release 1.0.0 --push  # Bump + tag + push (triggers CI)
#   ./scripts/build-release.sh verify           # Pre-release verification
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
DIM='\033[2m'
NC='\033[0m'

log()  { echo -e "${CYAN}  ▸${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()  { echo -e "${RED}  ✗${NC} $*"; exit 1; }

VERSION=$(node -e "console.log(require('./package.json').version)")

# ── Verify (pre-release checks) ──────────────────────────────
verify() {
  echo -e "\n${BOLD}🔍 Pre-Release Verification${NC}\n"
  PASS=0
  FAIL=0

  # 1. Git clean
  log "Git working tree…"
  if [ -z "$(git status --porcelain)" ]; then
    ok "Clean working tree"
    ((PASS++))
  else
    warn "Uncommitted changes detected"
    git status --short
    ((FAIL++))
  fi

  # 2. Dependencies
  log "Dependencies…"
  if pnpm install --frozen-lockfile &>/dev/null; then
    ok "Lock file in sync"
    ((PASS++))
  else
    warn "Lock file out of sync — run pnpm install"
    ((FAIL++))
  fi

  # 3. TypeScript
  log "TypeScript strict check…"
  if npx tsc --noEmit &>/dev/null; then
    ok "Zero type errors"
    ((PASS++))
  else
    warn "TypeScript errors found"
    npx tsc --noEmit 2>&1 | head -10
    ((FAIL++))
  fi

  # 4. Production build
  log "Production build…"
  rm -rf .next out
  if pnpm build &>/dev/null; then
    ok "Build successful"
    ((PASS++))
  else
    warn "Build failed"
    ((FAIL++))
  fi

  # 5. Output size
  log "Bundle analysis…"
  if [ -d .next ]; then
    SIZE=$(du -sh .next | awk '{print $1}')
    ok "Bundle size: $SIZE"
    ((PASS++))
  fi

  # 6. No secrets in git history
  log "Secret scan (gitleaks)…"
  if pnpm secrets:scan &>/dev/null; then
    ok "No new secrets detected"
    ((PASS++))
  else
    warn "Potential secret findings detected:"
    pnpm secrets:scan || true
    ((FAIL++))
  fi

  # 7. .env.example exists
  log "Environment template…"
  if [ -f .env.example ]; then
    ok ".env.example present"
    ((PASS++))
  else
    warn "Missing .env.example"
    ((FAIL++))
  fi

  # 8. Version consistency
  log "Version consistency…"
  PKG_V=$(node -e "console.log(require('./package.json').version)")
  TAURI_V=$(node -e "console.log(require('./src-tauri/tauri.conf.json').version)")
  if [ "$PKG_V" = "$TAURI_V" ]; then
    ok "Versions match: v$PKG_V"
    ((PASS++))
  else
    warn "Version mismatch: package.json=$PKG_V tauri.conf.json=$TAURI_V"
    ((FAIL++))
  fi

  echo ""
  echo -e "  ${BOLD}Results:${NC} ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
  echo ""

  if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${YELLOW}Fix the above issues before releasing.${NC}"
    return 1
  else
    echo -e "  ${GREEN}${BOLD}All checks passed — ready to release!${NC}"
    return 0
  fi
}

# ── Build: Web ────────────────────────────────────────────────
build_web() {
  echo -e "\n${BOLD}📦 Knot Code v${VERSION} — Web Production Build${NC}\n"

  log "Installing dependencies…"
  pnpm install --frozen-lockfile

  log "Cleaning previous build…"
  rm -rf .next out

  log "Building Next.js (static export)…"
  pnpm build

  if [ -d out ]; then
    SIZE=$(du -sh out | awk '{print $1}')
    ok "Static export ready: ./out ($SIZE)"
  else
    SIZE=$(du -sh .next | awk '{print $1}')
    ok "Build ready: ./.next ($SIZE)"
  fi

  echo ""
  echo -e "  ${DIM}Deploy options:${NC}"
  echo -e "    ${CYAN}Vercel:${NC}   vercel deploy --prod"
  echo -e "    ${CYAN}Static:${NC}   npx serve out"
  echo -e "    ${CYAN}Docker:${NC}   docker build -t knot-code ."
  echo ""

  if echo "$@" | grep -q "\-\-serve"; then
    log "Starting local production server…"
    echo -e "  ${CYAN}→${NC} http://localhost:3080\n"
    npx serve out -l 3080
  fi
}

# ── Build: Desktop ────────────────────────────────────────────
build_desktop() {
  echo -e "\n${BOLD}🖥  Knot Code v${VERSION} — Desktop Production Build${NC}\n"

  if echo "$@" | grep -q "\-\-universal"; then
    err "--universal is no longer supported. DMG builds are aarch64-only."
  fi

  # Check Rust
  if ! command -v rustc &>/dev/null; then
    err "Rust not found. Install from https://rustup.rs"
  fi
  ok "Rust $(rustc --version | awk '{print $2}')"

  log "Installing dependencies…"
  pnpm install --frozen-lockfile

  log "Cleaning previous build…"
  rm -rf .next out

  log "Building aarch64 binary…"
  rustup target add aarch64-apple-darwin 2>/dev/null || true

  echo -e "  ${DIM}This may take a few minutes on first build (Rust compilation)${NC}\n"

  pnpm tauri build --target aarch64-apple-darwin

  # Find the DMG
  echo ""
  DMG=$(find src-tauri/target -name "*.dmg" -type f 2>/dev/null | head -1)
  APP=$(find src-tauri/target -name "*.app" -type d 2>/dev/null | head -1)

  if [ -n "$DMG" ]; then
    SIZE=$(du -sh "$DMG" | awk '{print $1}')
    ok "DMG ready: $DMG ($SIZE)"
  fi

  if [ -n "$APP" ]; then
    ok "App bundle: $APP"
  fi

  echo ""
  echo -e "  ${DIM}To install: Open the DMG and drag Knot Code to Applications${NC}"
  echo ""
}

# ── Release ───────────────────────────────────────────────────
do_release() {
  NEW_VERSION="${1:-}"
  if [ -z "$NEW_VERSION" ]; then
    err "Usage: ./scripts/build-release.sh release <version> [--push]"
  fi

  echo -e "\n${BOLD}🚀 Knot Code — Release v${NEW_VERSION}${NC}\n"

  # Run verification first
  if ! verify; then
    echo ""
    err "Pre-release verification failed. Fix issues first."
  fi

  echo ""
  log "Bumping version to ${NEW_VERSION}…"
  pnpm release "$NEW_VERSION" $(echo "$@" | grep -o "\-\-push" || true)

  echo ""
  ok "Release v${NEW_VERSION} complete!"

  if echo "$@" | grep -q "\-\-push"; then
    echo ""
    echo -e "  ${GREEN}GitHub Actions will build the DMG and create a draft release.${NC}"
    echo -e "  ${CYAN}→${NC} https://github.com/OpenKnots/code-editor/actions"
    echo -e "  ${CYAN}→${NC} https://github.com/OpenKnots/code-editor/releases"
  else
    echo ""
    echo -e "  To trigger the CI release workflow:"
    echo -e "    ${CYAN}git push origin HEAD --tags${NC}"
  fi
  echo ""
}

# ── Main ──────────────────────────────────────────────────────
TARGET="${1:-}"
shift || true

case "$TARGET" in
  web)       build_web "$@" ;;
  desktop)   build_desktop "$@" ;;
  release)   do_release "$@" ;;
  verify)    verify ;;
  *)
    echo -e "\n${BOLD}Knot Code — Build & Release${NC}\n"
    echo "  Usage:"
    echo "    ./scripts/build-release.sh web [--serve]           Build for web"
    echo "    ./scripts/build-release.sh desktop                 Build macOS aarch64 DMG"
    echo "    ./scripts/build-release.sh release <ver> [--push]  Version + tag + release"
    echo "    ./scripts/build-release.sh verify                  Pre-release checks"
    echo ""
    echo "  Current version: v${VERSION}"
    echo ""
    exit 1
    ;;
esac
