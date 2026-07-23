#!/bin/bash
set -euo pipefail

# SpicyHome POS — date-based version bump helper
#
# Uses a YYYYMM.DD.N scheme where:
#   - YYYYMM.DD is the release date (Asia/Riyadh)
#   - .N is the same-day increment, starting at .0
#
# The full version (YYYYMM.DD.N) is always valid semver (MAJOR.MINOR.PATCH).
#
# Keeps the single source of truth (VERSION) in sync with all package.json
# files and MODULE.bazel. Prints the new version to stdout so callers can use
# it for tags, release assets, etc.
#
# Usage: scripts/bump-version.sh [--dry] [--today YYYYMMDD] [date|<YYYYMM.DD.N>]
#   --dry                Print what would happen without writing any files
#   --today YYYYMMDD     Override today's date for testing (e.g. --today 20260801)
#   date                 Auto-bump based on today's date
#   explicit version     Use the provided version directly (e.g. 202607.23.0 or 202607.23.1)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Parse flags
DRY_RUN=false
OVERRIDE_TODAY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry)
      DRY_RUN=true
      shift
      ;;
    --today)
      if [[ -z "${2:-}" ]]; then
        echo "Error: --today requires a date (YYYYMMDD)" >&2
        exit 1
      fi
      OVERRIDE_TODAY="$2"
      shift 2
      ;;
    *)
      BUMP="$1"
      shift
      ;;
  esac
done
BUMP="${BUMP:-date}"

# Default to Asia/Riyadh for release dates if TZ is not already set
TZ="${TZ:-Asia/Riyadh}"
export TZ

if [[ -n "$OVERRIDE_TODAY" ]]; then
  if [[ "$OVERRIDE_TODAY" =~ ^[0-9]{8}$ ]]; then
    TODAY="${OVERRIDE_TODAY:0:6}.$(printf "%02d" "$((10#${OVERRIDE_TODAY:6:2}))")"
  else
    echo "Error: --today must match YYYYMMDD (e.g. 20260801)" >&2
    exit 1
  fi
else
  TODAY=$(date +%Y%m)
  TODAY="${TODAY}.$(date +%d)"
fi

CURRENT_VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")

if [[ "$BUMP" != "date" ]]; then
  if [[ "$BUMP" =~ ^[0-9]{6}\.[0-9]{2}\.[0-9]+$ ]]; then
    NEXT_VERSION="$BUMP"
  else
    echo "Error: explicit version must match YYYYMM.DD.N (e.g. 202607.23.0 or 202607.23.1)" >&2
    exit 1
  fi
else
  # Auto-bump based on today's date
  if [[ "$CURRENT_VERSION" =~ ^([0-9]{6}\.[0-9]{2})\.([0-9]+)$ ]]; then
    BASE="${BASH_REMATCH[1]}"
    INCREMENT="${BASH_REMATCH[2]}"
    if [[ "$BASE" == "$TODAY" ]]; then
      NEXT_VERSION="${TODAY}.$((10#$INCREMENT + 1))"
    elif [[ "$BASE" < "$TODAY" ]]; then
      NEXT_VERSION="${TODAY}.0"
    else
      # Current version is a future date (should not happen); reset to today
      NEXT_VERSION="${TODAY}.0"
    fi
  else
    # No previous date-based release (e.g. 0.0.0)
    NEXT_VERSION="${TODAY}.0"
  fi
fi

echo "Bumping version: $CURRENT_VERSION -> $NEXT_VERSION" >&2

# Update the single source of truth
if $DRY_RUN; then
  echo "[dry-run] Would write VERSION: $NEXT_VERSION" >&2
else
  echo "$NEXT_VERSION" > "$ROOT_DIR/VERSION"
fi

if $DRY_RUN; then
  echo "[dry-run] Would update MODULE.bazel: version = \"$NEXT_VERSION\"" >&2
else
  sed -i.bak -E 's/^(    version = ")[^"]+(",)$/\1'"$NEXT_VERSION"'\2/' "$ROOT_DIR/MODULE.bazel"
  rm -f "$ROOT_DIR/MODULE.bazel.bak"
fi

if $DRY_RUN; then
  echo "[dry-run] Would update package.json files: version = \"$NEXT_VERSION\"" >&2
else
  for pkg in \
    "$ROOT_DIR/apps/server/package.json" \
    "$ROOT_DIR/apps/pos/package.json" \
    "$ROOT_DIR/packages/shared/package.json" \
    "$ROOT_DIR/packages/db/package.json" \
    "$ROOT_DIR/packages/api-spec/package.json" \
    "$ROOT_DIR/packages/client-ts/package.json" \
    "$ROOT_DIR/packages/client-kt/package.json"
  do
    if [ -f "$pkg" ]; then
      node -e "
        const fs = require('fs');
        const path = '$pkg';
        const json = JSON.parse(fs.readFileSync(path, 'utf8'));
        json.version = '$NEXT_VERSION';
        fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n', 'utf8');
      "
    fi
  done
fi

echo "$NEXT_VERSION"
