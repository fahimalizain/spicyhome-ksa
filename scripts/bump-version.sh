#!/bin/bash
set -euo pipefail

# SpicyHome POS — date-based version bump helper
#
# Uses a YYYYMMDD[.N] scheme where:
#   - YYYYMMDD is the release date (Asia/Riyadh)
#   - .N is an optional same-day increment, starting at .1
#
# Keeps the single source of truth (VERSION) in sync with all package.json
# files and MODULE.bazel. Prints the new version to stdout so callers can use
# it for tags, release assets, etc.
#
# Usage: scripts/bump-version.sh [date|<YYYYMMDD>|<YYYYMMDD.N>]
#   date               Auto-bump based on today's date
#   explicit version   Use the provided version directly (e.g. 20260722 or 20260722.1)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUMP="${1:-date}"

# Default to Asia/Riyadh for release dates if TZ is not already set
TZ="${TZ:-Asia/Riyadh}"
export TZ
TODAY=$(date +%Y%m%d)

CURRENT_VERSION=$(tr -d '[:space:]' < "$ROOT_DIR/VERSION")

if [[ "$BUMP" != "date" ]]; then
  if [[ "$BUMP" =~ ^[0-9]{8}(\.[0-9]+)?$ ]]; then
    NEXT_VERSION="$BUMP"
  else
    echo "Error: explicit version must match YYYYMMDD[.N] (e.g. 20260722 or 20260722.1)" >&2
    exit 1
  fi
else
  # Auto-bump based on today's date
  if [[ "$CURRENT_VERSION" =~ ^[0-9]{8}$ ]]; then
    if [[ "$CURRENT_VERSION" == "$TODAY" ]]; then
      NEXT_VERSION="${TODAY}.1"
    elif [[ "$CURRENT_VERSION" < "$TODAY" ]]; then
      NEXT_VERSION="$TODAY"
    else
      # Current version is a future date (should not happen); reset to today
      NEXT_VERSION="${TODAY}.1"
    fi
  elif [[ "$CURRENT_VERSION" =~ ^([0-9]{8})\.([0-9]+)$ ]]; then
    BASE="${BASH_REMATCH[1]}"
    INCREMENT="${BASH_REMATCH[2]}"
    if [[ "$BASE" == "$TODAY" ]]; then
      NEXT_VERSION="${TODAY}.$((INCREMENT + 1))"
    elif [[ "$BASE" < "$TODAY" ]]; then
      NEXT_VERSION="$TODAY"
    else
      NEXT_VERSION="${TODAY}.1"
    fi
  else
    # No previous date-based release (e.g. 0.0.0)
    NEXT_VERSION="$TODAY"
  fi
fi

echo "Bumping version: $CURRENT_VERSION -> $NEXT_VERSION" >&2

# Update the single source of truth
echo "$NEXT_VERSION" > "$ROOT_DIR/VERSION"

# Update MODULE.bazel module version
sed -i.bak -E 's/^(    version = ")[^"]+(",)$/\1'"$NEXT_VERSION"'\2/' "$ROOT_DIR/MODULE.bazel"
rm -f "$ROOT_DIR/MODULE.bazel.bak"

# Update all workspace package.json files
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

echo "$NEXT_VERSION"
