#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Knot Code — Sign, Notarize & Deploy macOS DMG
# ──────────────────────────────────────────────────────────────
#
# Signs the Tauri-built .app bundle with your Apple Developer
# certificate, packages it into a DMG, notarizes it with Apple,
# and staples the notarization ticket so end users never see
# Gatekeeper warnings.
#
# Prerequisites:
#   1. An Apple Developer account enrolled in the Developer ID program
#   2. A "Developer ID Application" certificate in your Keychain
#   3. An app-specific password for notarization
#      → https://appleid.apple.com → Sign-In and Security → App-Specific Passwords
#
# Usage:
#   ./scripts/sign-and-deploy.sh                 # Build, sign, notarize (aarch64)
#   ./scripts/sign-and-deploy.sh --skip-build    # Sign an existing aarch64 build
#   ./scripts/sign-and-deploy.sh --help          # Show this help
#
# Environment (set in .env.signing or export before running):
#   APPLE_SIGNING_IDENTITY   — e.g. "Developer ID Application: Your Name (TEAM_ID)"
#   APPLE_ID                 — your Apple ID email
#   APPLE_TEAM_ID            — 10-character team ID
#   APPLE_APP_SPECIFIC_PASSWORD — app-specific password for notarytool
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
step() { echo -e "\n${BOLD}$1${NC}\n"; }

# ── Help ────────────────────────────────────────────────────────
show_help() {
  echo -e "\n${BOLD}Knot Code — Sign, Notarize & Deploy${NC}\n"
  echo "  Usage:"
  echo "    ./scripts/sign-and-deploy.sh [options]"
  echo ""
  echo "  Options:"
  echo "    --skip-build    Skip the Tauri build step (sign existing build)"
  echo "    --skip-notarize Skip notarization (just sign)"
  echo "    --help          Show this help message"
  echo ""
  echo "  Environment variables (or set in .env.signing):"
  echo "    APPLE_SIGNING_IDENTITY     Code signing identity"
  echo "    APPLE_ID                   Apple ID email"
  echo "    APPLE_TEAM_ID              10-character team ID"
  echo "    APPLE_APP_SPECIFIC_PASSWORD  App-specific password"
  echo ""
  exit 0
}

# ── Parse args ──────────────────────────────────────────────────
SKIP_BUILD=false
SKIP_NOTARIZE=false

for arg in "$@"; do
  case "$arg" in
    --universal)      err "--universal is no longer supported. DMG builds are aarch64-only." ;;
    --skip-build)     SKIP_BUILD=true ;;
    --skip-notarize)  SKIP_NOTARIZE=true ;;
    --help|-h)        show_help ;;
    *) warn "Unknown option: $arg" ;;
  esac
done

# ── Load signing env ────────────────────────────────────────────
if [ -f "$ROOT/.env.signing" ]; then
  log "Loading signing config from .env.signing"
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.signing"
  set +a
fi

# ── Validate signing prerequisites ──────────────────────────────
step "1/5  Checking prerequisites"

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo ""
  echo -e "  ${YELLOW}No APPLE_SIGNING_IDENTITY set.${NC}"
  echo ""
  echo "  Available signing identities in your Keychain:"
  echo ""
  security find-identity -v -p codesigning | head -20
  echo ""
  echo -e "  ${DIM}Copy the identity string (in quotes) and set it:${NC}"
  echo -e "    ${CYAN}export APPLE_SIGNING_IDENTITY=\"Developer ID Application: ...\"${NC}"
  echo ""
  echo -e "  ${DIM}Or create ${CYAN}.env.signing${NC}${DIM} with your credentials:${NC}"
  echo -e "    ${CYAN}APPLE_SIGNING_IDENTITY=\"Developer ID Application: Your Name (TEAMID)\"${NC}"
  echo -e "    ${CYAN}APPLE_ID=\"you@example.com\"${NC}"
  echo -e "    ${CYAN}APPLE_TEAM_ID=\"ABCDE12345\"${NC}"
  echo -e "    ${CYAN}APPLE_APP_SPECIFIC_PASSWORD=\"xxxx-xxxx-xxxx-xxxx\"${NC}"
  echo ""
  err "APPLE_SIGNING_IDENTITY is required."
fi

ok "Signing identity: ${APPLE_SIGNING_IDENTITY}"

if [ "$SKIP_NOTARIZE" = false ]; then
  [ -z "${APPLE_ID:-}" ] && err "APPLE_ID is required for notarization. Set it or use --skip-notarize."
  [ -z "${APPLE_TEAM_ID:-}" ] && err "APPLE_TEAM_ID is required for notarization. Set it or use --skip-notarize."
  [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] && err "APPLE_APP_SPECIFIC_PASSWORD is required for notarization. Set it or use --skip-notarize."
  ok "Notarization credentials present"
fi

if ! command -v codesign &>/dev/null; then
  err "codesign not found. This script requires macOS with Xcode Command Line Tools."
fi
ok "codesign available"

if [ "$SKIP_NOTARIZE" = false ] && ! command -v xcrun &>/dev/null; then
  err "xcrun not found. Install Xcode Command Line Tools: xcode-select --install"
fi

# ── Store notarization credentials in Keychain ──────────────────
if [ "$SKIP_NOTARIZE" = false ]; then
  log "Storing notarization credentials in Keychain (notarytool)…"
  xcrun notarytool store-credentials "KnotCode-notarize" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    2>/dev/null || true
  ok "Keychain profile 'KnotCode-notarize' ready"
fi

# ── Build ───────────────────────────────────────────────────────
VERSION=$(node -e "console.log(require('./package.json').version)")

if [ "$SKIP_BUILD" = false ]; then
  step "2/5  Building KnotCode v${VERSION}"

  log "Building aarch64 binary…"
  rustup target add aarch64-apple-darwin 2>/dev/null || true

  APPLE_SIGNING_IDENTITY="$APPLE_SIGNING_IDENTITY" \
  APPLE_ID="$APPLE_ID" \
  APPLE_TEAM_ID="$APPLE_TEAM_ID" \
  APPLE_APP_SPECIFIC_PASSWORD="$APPLE_APP_SPECIFIC_PASSWORD" \
    pnpm tauri build --target aarch64-apple-darwin

  ok "Tauri build complete"
else
  step "2/5  Skipping build (--skip-build)"
fi

# ── Locate artefacts ────────────────────────────────────────────
step "3/5  Locating build artefacts"

TARGET_DIR="src-tauri/target/aarch64-apple-darwin/release/bundle"

APP_PATH=$(find "$TARGET_DIR" -name "*.app" -type d 2>/dev/null | head -1)
[ -z "$APP_PATH" ] && err "Could not find .app bundle in $TARGET_DIR"
ok "App bundle: $APP_PATH"

# ── Deep-sign the .app ──────────────────────────────────────────
step "4/5  Code signing"

log "Signing all nested binaries and frameworks…"

codesign --deep --force --verify --verbose \
  --sign "$APPLE_SIGNING_IDENTITY" \
  --options runtime \
  --entitlements "$ROOT/src-tauri/Entitlements.plist" \
  "$APP_PATH" 2>&1 | while IFS= read -r line; do
    echo -e "  ${DIM}$line${NC}"
  done

ok "Code signing complete"

log "Verifying signature…"
codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1 | while IFS= read -r line; do
  echo -e "  ${DIM}$line${NC}"
done
ok "Signature verified"

log "Checking Gatekeeper acceptance…"
if spctl --assess --type exec --verbose "$APP_PATH" 2>&1; then
  ok "Gatekeeper: accepted"
else
  warn "Gatekeeper pre-check failed (may pass after notarization)"
fi

# ── Create signed DMG ───────────────────────────────────────────
APP_NAME=$(basename "$APP_PATH" .app)
DMG_NAME="KnotCode_${VERSION}.dmg"
DMG_PATH="$ROOT/dist/$DMG_NAME"
mkdir -p "$ROOT/dist"

log "Creating DMG: $DMG_NAME"

hdiutil create -volname "$APP_NAME" \
  -srcfolder "$APP_PATH" \
  -ov -format UDZO \
  "$DMG_PATH"

log "Signing DMG…"
codesign --force --sign "$APPLE_SIGNING_IDENTITY" "$DMG_PATH"
ok "DMG signed: $DMG_PATH"

# ── Notarize ────────────────────────────────────────────────────
if [ "$SKIP_NOTARIZE" = false ]; then
  step "5/5  Notarization"

  log "Submitting DMG to Apple for notarization…"
  log "This can take 5–15 minutes. Go grab a coffee."
  echo ""

  xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "KnotCode-notarize" \
    --wait 2>&1 | while IFS= read -r line; do
      echo -e "  ${DIM}$line${NC}"
    done

  ok "Notarization complete"

  log "Stapling notarization ticket to DMG…"
  xcrun stapler staple "$DMG_PATH"
  ok "Ticket stapled"

  log "Final Gatekeeper check…"
  spctl --assess --type open --context context:primary-signature --verbose "$DMG_PATH" 2>&1 || true
  ok "DMG is signed, notarized, and ready to distribute"
else
  step "5/5  Skipping notarization (--skip-notarize)"
fi

# ── Summary ─────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}${BOLD}✓ Done!${NC}"
echo ""
echo -e "  ${BOLD}Artefact:${NC}  $DMG_PATH"
SIZE=$(du -sh "$DMG_PATH" | awk '{print $1}')
echo -e "  ${BOLD}Size:${NC}      $SIZE"
echo -e "  ${BOLD}Version:${NC}   v$VERSION"
echo ""
echo -e "  ${DIM}To distribute:${NC}"
echo -e "    ${CYAN}1.${NC} Upload to GitHub Releases, S3, or your CDN"
echo -e "    ${CYAN}2.${NC} Users can install directly — no Gatekeeper warnings"
echo ""
