#!/bin/bash
set -euo pipefail

# Packaging smoke test — verifies the production install flow:
#   1. Bazel outputs exist
#   2. Package directory is assembled correctly
#   3. package.json files are generated with correct file: references
#   4. npm install in packages/shared (for zod and other workspace-only deps)
#   5. npm install in server (with file: workspace symlinks)
#   6. Workspace package requires resolve correctly (regression guard for zod)
#   7. No npm install in packages/db (protects better-sqlite3 prebuilt)
#
# Runs on macOS (local dev) and Linux (GitHub Actions ubuntu-latest).
# Mirrors the install order used by spicyhome.ps1 Install-NpmDeps and the
# generated start-server.ps1 first-run block.

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
cp packaging/prebuilt/win_rawprint.exe "$TEST_DIR/prebuilt/" 2>/dev/null || true

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

# ── 4. npm install — shared first, then server ──
# This mirrors spicyhome.ps1 Install-NpmDeps and start-server.ps1 first-run
# order. Shared deps (e.g. zod) must exist before server links shared.
# Do NOT npm install in packages/db — nested better-sqlite3 would shadow
# the prebuilt binary under server/node_modules.
echo ""
echo "Running npm install in packages/shared ..."
cd "$TEST_DIR/packages/shared"
npm install --production --ignore-scripts 2>&1 | tail -3

echo ""
echo "Running npm install in server ..."
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
# NODE_PATH ensures workspace packages find server-hoisted deps.
export NODE_PATH="$TEST_DIR/server/node_modules"

echo ""
echo "Verifying module resolution..."

node -e "require('drizzle-orm/sqlite-core')" 2>/dev/null && echo "  drizzle-orm/sqlite-core  ✓" || { echo "  drizzle-orm/sqlite-core  ✗"; exit 1; }
node -e "require('bcryptjs')" 2>/dev/null && echo "  bcryptjs  ✓" || { echo "  bcryptjs  ✗"; exit 1; }
node -e "require('reflect-metadata')" 2>/dev/null && echo "  reflect-metadata  ✓" || { echo "  reflect-metadata  ✗"; exit 1; }

# ── 7. Verify workspace packages resolve ───────
echo ""
echo "Verifying workspace package resolution..."

# 7a. @spicyhome/shared — must load (core regression guard for zod).
#     shared/index.js re-exports printer-config which requires zod.
echo -n "  require('@spicyhome/shared') ... "
if node -e "require('@spicyhome/shared')" 2>/dev/null; then
  echo "✓"
else
  echo "✗ FAILED"
  echo "  ERROR: @spicyhome/shared failed to load. This likely means zod is missing"
  echo "  from packages/shared/node_modules. Verify npm install ran there first."
  exit 1
fi

# 7b. Verify zod exists in shared's own node_modules (the fix under test).
echo -n "  packages/shared/node_modules/zod ... "
if [ -d "$TEST_DIR/packages/shared/node_modules/zod" ]; then
  echo "✓"
else
  echo "✗ MISSING"
  echo "  ERROR: zod not found in packages/shared/node_modules."
  echo "  npm install must run in packages/shared BEFORE server."
  exit 1
fi

# 7c. @spicyhome/db — schema only (avoids better-sqlite3 native addon).
#     Full db index.js loads migrate.ts → better-sqlite3 → will fail on
#     macOS/Linux with the Windows prebuilt. Schema only needs drizzle.
echo -n "  require('@spicyhome/db/schema.js') ... "
if node -e "require('@spicyhome/db/schema.js')" 2>/dev/null; then
  echo "✓"
else
  echo "✗ FAILED"
  echo "  ERROR: @spicyhome/db schema failed to load."
  exit 1
fi

# 7d. Confirm no npm install ran in packages/db (protect better-sqlite3 prebuilt).
echo -n "  packages/db has no nested node_modules (protect prebuilt) ... "
if [ -d "$TEST_DIR/packages/db/node_modules" ]; then
  echo "✗ UNEXPECTED"
  echo "  ERROR: packages/db/node_modules exists. Nested better-sqlite3 may shadow the prebuilt binary."
  exit 1
else
  echo "✓"
fi

echo ""
echo "=== All checks passed ==="
echo "Test package at: $TEST_DIR"
