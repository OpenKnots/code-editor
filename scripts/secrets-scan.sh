#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-staged}"
BASELINE_PATH="${GITLEAKS_BASELINE:-.gitleaks.baseline.json}"

resolve_gitleaks() {
  if [ -x "$ROOT/.tools/bin/gitleaks" ]; then
    echo "$ROOT/.tools/bin/gitleaks"
    return 0
  fi
  if [ -n "${LOCALAPPDATA:-}" ]; then
    for candidate in "$LOCALAPPDATA"/Microsoft/WinGet/Packages/*/gitleaks.exe; do
      if [ -x "$candidate" ]; then
        echo "$candidate"
        return 0
      fi
    done
  fi
  if command -v gitleaks >/dev/null 2>&1; then
    command -v gitleaks
    return 0
  fi
  return 1
}

if ! GITLEAKS_BIN="$(resolve_gitleaks)"; then
  echo "gitleaks is required but was not found." >&2
  echo "Install with Homebrew: brew install gitleaks" >&2
  echo "or install locally for this repo:" >&2
  echo "  GOBIN=\"$ROOT/.tools/bin\" go install github.com/zricethezav/gitleaks/v8@latest" >&2
  exit 1
fi

if [ ! -f "$BASELINE_PATH" ]; then
  printf '[]\n' > "$BASELINE_PATH"
fi

COMMON_FLAGS=(--redact --baseline-path "$BASELINE_PATH")

case "$MODE" in
  staged)
    "$GITLEAKS_BIN" protect --staged "${COMMON_FLAGS[@]}" --exit-code 1
    ;;
  history)
    "$GITLEAKS_BIN" git --log-opts="--all" "${COMMON_FLAGS[@]}" --exit-code 1 .
    ;;
  dir)
    "$GITLEAKS_BIN" dir "${COMMON_FLAGS[@]}" --exit-code 1 .
    ;;
  baseline)
    "$GITLEAKS_BIN" git --log-opts="--all" --redact --exit-code 0 --report-format json --report-path "$BASELINE_PATH" .
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    echo "Usage: scripts/secrets-scan.sh [staged|history|dir|baseline]" >&2
    exit 1
    ;;
esac
