#!/usr/bin/env bash
set -euo pipefail

# ─── Knot Code macOS Release Script ─────────────────────────────────
# Usage: ./scripts/release-macos.sh <version>
# Example: ./scripts/release-macos.sh 1.3.0
#
# Prerequisites:
#   - Developer ID cert in keychain (Soul Protocol LLC)
#   - Notary keychain profile "notary" configured
#   - gh CLI authenticated
#   - Entitlements.plist at src-tauri/Entitlements.plist
# ─────────────────────────────────────────────────────────────────────

VERSION="${1:?Usage: $0 <version> (e.g. 1.3.0)}"
IDENTITY="Developer ID Application: Soul Protocol LLC (9LR8Z8UQ9X)"
ENTITLEMENTS="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/Entitlements.plist"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DMG_NAME="KnotCode_${VERSION}_aarch64.dmg"
WORK="/tmp/knotcode-release-${VERSION}"

cd "$REPO_ROOT"

echo "═══════════════════════════════════════════════════════"
echo "  Knot Code Release — v${VERSION} (macOS aarch64)"
echo "═══════════════════════════════════════════════════════"

# ── 1. Preflight checks ─────────────────────────────────────────────
echo ""
echo "▸ [1/10] Preflight checks..."

if [ ! -f "$ENTITLEMENTS" ]; then
  echo "  ✗ Entitlements.plist not found at $ENTITLEMENTS"
  echo "  Creating default entitlements..."
  cat > "$ENTITLEMENTS" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
PLIST
fi

security find-identity -v -p codesigning | grep -q "9LR8Z8UQ9X" || {
  echo "  ✗ Developer ID certificate not found in keychain"; exit 1
}
xcrun notarytool store-credentials --help > /dev/null 2>&1 || {
  echo "  ✗ notarytool not available"; exit 1
}
command -v gh > /dev/null || { echo "  ✗ gh CLI not found"; exit 1; }
echo "  ✓ All checks passed"

# ── 2. Bump versions ────────────────────────────────────────────────
echo ""
echo "▸ [2/10] Bumping version to ${VERSION}..."

# package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" package.json

# tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

# Cargo.toml (only the first version line)
sed -i '' "0,/^version = \".*\"/s//version = \"${VERSION}\"/" src-tauri/Cargo.toml

echo "  ✓ package.json, tauri.conf.json, Cargo.toml → ${VERSION}"

# ── 3. Build frontend + Tauri ───────────────────────────────────────
echo ""
echo "▸ [3/10] Building Tauri app..."

# Clean Rust cache to force Info.plist regeneration
cargo clean --manifest-path src-tauri/Cargo.toml --release -p app 2>/dev/null || true

npx tauri build --bundles app 2>&1 | tail -3
echo "  ✓ Build complete"

# ── 4. Prepare app bundle ───────────────────────────────────────────
echo ""
echo "▸ [4/10] Preparing app bundle..."

rm -rf "$WORK"
mkdir -p "$WORK"

APP_SRC="src-tauri/target/release/bundle/macos/KnotCode.app"
APP="$WORK/KnotCode.app"
ditto "$APP_SRC" "$APP"

# Patch version in Info.plist (Tauri sometimes caches old values)
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${VERSION}" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${VERSION}" "$APP/Contents/Info.plist"

ACTUAL_VER=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString)
echo "  ✓ App bundle ready (CFBundleShortVersionString: ${ACTUAL_VER})"

# ── 5. Code sign ────────────────────────────────────────────────────
echo ""
echo "▸ [5/10] Signing..."

codesign --force --options runtime \
  --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" \
  "$APP/Contents/MacOS/app"

codesign --force --options runtime \
  --sign "$IDENTITY" \
  --entitlements "$ENTITLEMENTS" \
  "$APP"

codesign --verify --deep --strict "$APP" 2>&1 | tail -1
echo "  ✓ Signed with Developer ID"

# ── 6. Notarize app ─────────────────────────────────────────────────
echo ""
echo "▸ [6/10] Notarizing app..."

ditto -c -k --keepParent "$APP" "$WORK/KnotCode.zip"
xcrun notarytool submit "$WORK/KnotCode.zip" --keychain-profile "notary" --wait 2>&1 | tail -3
xcrun stapler staple "$APP" 2>&1 | tail -1

# Verify Gatekeeper
SPCTL=$(/usr/sbin/spctl --assess --type exec --verbose "$APP" 2>&1)
echo "  $SPCTL"
echo "$SPCTL" | grep -q "accepted" || { echo "  ✗ Gatekeeper rejected!"; exit 1; }

# ── 7. Create DMG ───────────────────────────────────────────────────
echo ""
echo "▸ [7/10] Creating DMG..."

DMG_PATH="$WORK/$DMG_NAME"
hdiutil create -volname "KnotCode" -srcfolder "$APP" -ov -format UDZO "$DMG_PATH" 2>&1 | tail -1

# ── 8. Notarize DMG ─────────────────────────────────────────────────
echo ""
echo "▸ [8/10] Notarizing DMG..."

xcrun notarytool submit "$DMG_PATH" --keychain-profile "notary" --wait 2>&1 | tail -3
xcrun stapler staple "$DMG_PATH" 2>&1 | tail -1

DMG_SIZE=$(ls -lh "$DMG_PATH" | awk '{print $5}')
echo "  ✓ DMG ready: ${DMG_NAME} (${DMG_SIZE})"

# ── 9. Git tag + push ───────────────────────────────────────────────
echo ""
echo "▸ [9/10] Committing and tagging..."

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/Entitlements.plist 2>/dev/null || true
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v${VERSION}" --allow-empty 2>/dev/null || true
git tag -f "v${VERSION}" -m "v${VERSION}"
git push origin main 2>/dev/null || true
git push origin "v${VERSION}" --force 2>/dev/null || true

echo "  ✓ Tagged v${VERSION}"

# ── 10. Upload to GitHub Release ────────────────────────────────────
echo ""
echo "▸ [10/10] Uploading to GitHub Release..."

# Create release if it doesn't exist
GH_TOKEN="" gh release create "v${VERSION}" \
  --title "Knot Code v${VERSION}" \
  --notes "Release v${VERSION} — see CHANGELOG.md for details." \
  --latest 2>/dev/null || true

# Upload DMG (clobber if exists)
GH_TOKEN="" gh release upload "v${VERSION}" "$DMG_PATH" --clobber

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Knot Code v${VERSION} released!"
echo ""
echo "  DMG:     ${DMG_PATH}"
echo "  Release: https://github.com/OpenKnots/code-editor/releases/tag/v${VERSION}"
echo "  Size:    ${DMG_SIZE}"
echo "═══════════════════════════════════════════════════════"
