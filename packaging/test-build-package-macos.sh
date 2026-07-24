#!/bin/bash
set -euo pipefail

# Local test for the Windows 7 package build — verifies:
#   1. Bazel outputs exist
#   2. Package directory is assembled correctly
#   3. package.json files are generated with correct file: references
#   4. npm install resolves all deps including workspace packages
#   5. Key modules (including workspace imports) load without errors

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_DIR="/tmp/spicyhome-packaging-test"

echo "=== Packaging smoke test ==="

# ── 1. Check Bazel outputs ──────────────────────
echo ""
echo "Checking Bazel outputs..."
MISSING=false
for target in apps/server/src/main.js packages/shared/src/index.js packages/db/src/index.js; do
  if [ ! -f "$ROOT_DIR/bazel-bin/$target" ]; then
    echo "  MISSING: bazel-bin/$target (run: bazel build //apps/server:lib //packages/shared:lib //packages/db:lib)"
    MISSING=true
  fi
done
if $MISSING; then exit 1; fi
echo "  OK"

# ── 2. Assemble package directory ───────────────
echo ""
echo "Assembling package..."
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR/server" "$TEST_DIR/packages/shared" "$TEST_DIR/packages/db" "$TEST_DIR/prebuilt"

# Copy compiled JS from Bazel output
cd "$ROOT_DIR"

find bazel-bin/apps/server/src -name "*.js" -print0 | while IFS= read -r -d '' f; do
  rel="${f#bazel-bin/apps/server/src/}"
  mkdir -p "$TEST_DIR/server/$(dirname "$rel")"
  cp -f "$f" "$TEST_DIR/server/$rel"
done

find bazel-bin/packages/shared/src -name "*.js" -print0 2>/dev/null | while IFS= read -r -d '' f; do
  rel="${f#bazel-bin/packages/shared/src/}"
  mkdir -p "$TEST_DIR/packages/shared/$(dirname "$rel")"
  cp -f "$f" "$TEST_DIR/packages/shared/$rel"
done

find bazel-bin/packages/db/src -name "*.js" -print0 2>/dev/null | while IFS= read -r -d '' f; do
  rel="${f#bazel-bin/packages/db/src/}"
  mkdir -p "$TEST_DIR/packages/db/$(dirname "$rel")"
  cp -f "$f" "$TEST_DIR/packages/db/$rel"
done

# Copy source package.json files
cp apps/server/package.json "$TEST_DIR/server/package.json"
cp packages/shared/package.json "$TEST_DIR/packages/shared/package.json"
cp packages/db/package.json "$TEST_DIR/packages/db/package.json"

# Copy prebuilt native binary (won't load on macOS, needed for structure)
cp packaging/prebuilt/better_sqlite3.node "$TEST_DIR/prebuilt/"

# Run fixup
node "$SCRIPT_DIR/fixup-packages.js" "$TEST_DIR"

echo "  OK"

# ── 3. Verify generated package.json files ─────
echo ""
echo "Verifying package.json files..."

check_file_ref() {
  local file=$1 dep=$2 expected=$3
  local actual
  actual=$(node -e "console.log(require('$TEST_DIR/$file').dependencies['$dep'] || 'MISSING')")
  if [ "$actual" = "$expected" ]; then
    echo "  $file: $dep = $expected  ✓"
  else
    echo "  $file: $dep = $actual  ✗ (expected $expected)"
    exit 1
  fi
}

check_file_ref server/package.json @spicyhome/shared file:../packages/shared
check_file_ref server/package.json @spicyhome/db file:../packages/db
check_file_ref packages/db/package.json @spicyhome/shared file:../shared

echo "  OK"

# ── 4. npm install ─────────────────────────────
echo ""
echo "Running npm install..."
cd "$TEST_DIR/server"
npm install --production --ignore-scripts 2>&1 | tail -3

# ── 5. Verify workspace symlinks ───────────────
echo ""
echo "Verifying workspace symlinks..."

check_symlink() {
  local link=$1 target=$2
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
    echo "  $link -> $target  ✓"
  else
    echo "  $link: symlink missing or wrong  ✗"
    exit 1
  fi
}

check_symlink node_modules/@spicyhome/shared ../../../packages/shared
check_symlink node_modules/@spicyhome/db ../../../packages/db

echo "  OK"

# ── 6. Verify key modules resolve ──────────────
echo ""
echo "Verifying module resolution..."

node -e "require('drizzle-orm/sqlite-core')" 2>/dev/null && echo "  drizzle-orm/sqlite-core  ✓" || { echo "  drizzle-orm/sqlite-core  ✗"; exit 1; }
node -e "require('bcryptjs')" 2>/dev/null && echo "  bcryptjs  ✓" || { echo "  bcryptjs  ✗"; exit 1; }
node -e "require('reflect-metadata')" 2>/dev/null && echo "  reflect-metadata  ✓" || { echo "  reflect-metadata  ✗"; exit 1; }

echo ""
echo "=== All checks passed ==="
echo "Test package at: $TEST_DIR"
