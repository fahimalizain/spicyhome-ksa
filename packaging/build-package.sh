#!/bin/bash
set -euo pipefail

# SpicyHome POS — Windows 7 packaging script
#
# Produces dist/spicyhome-pos-win7.zip containing:
#   node/node.exe + node/npm.cmd  — Node.js v18.20.5 win-x64 (portable)
#   server/                       — compiled NestJS server JS + package.json
#   server/migrations/            — Drizzle SQL migration files
#   pos/                          — SPA static dist (from Vite)
#   start-server.bat              — startup script
#   README.txt                    — setup instructions
#   data/                         — created at runtime on target machine
#
# The start-server.bat runs 'npm install --production' on first launch
# to download server dependencies (including Windows-native better-sqlite3).

NODE_VERSION="18.20.5"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
NODE_SHA256="910237449895b4de61026568dc076fa6c3ffcd667563ed03112a4a77e1f1556b"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/spicyhome-pos-win7"
TEMP_DIR="$DIST_DIR/.tmp"

echo "=== SpicyHome POS Windows 7 Package Builder ==="
echo "Root: $ROOT_DIR"

# Clean
rm -rf "$PACKAGE_DIR" "$TEMP_DIR"
mkdir -p "$PACKAGE_DIR" "$TEMP_DIR"

# ──────────────────────────────────────────────────
# 1. Build everything with Bazel
# ──────────────────────────────────────────────────
echo "Building all targets with Bazel..."
cd "$ROOT_DIR"
bazel build \
  //apps/server:lib \
  //packages/shared:lib \
  //packages/db:lib \
  //apps/pos:build \
  2>&1

echo "Bazel build complete."

# ──────────────────────────────────────────────────
# 2. Download and verify Node.js win-x64
# ──────────────────────────────────────────────────
NODE_ZIP="$TEMP_DIR/node-v${NODE_VERSION}-win-x64.zip"

if [ ! -f "$NODE_ZIP" ]; then
  echo "Downloading Node.js v${NODE_VERSION} win-x64..."
  curl -fSL --connect-timeout 30 --max-time 300 -o "$NODE_ZIP" "$NODE_URL"
fi

echo "Verifying SHA256..."
echo "$NODE_SHA256  $NODE_ZIP" | shasum -a 256 -c -

echo "Extracting node.exe and npm.cmd..."
mkdir -p "$PACKAGE_DIR/node"
unzip -q -o "$NODE_ZIP" \
  "*/node.exe" \
  "*/npm.cmd" \
  "*/npx.cmd" \
  "*/node_modules/npm/*" \
  -d "$TEMP_DIR/node-extract"

# Find and copy node.exe, npm.cmd, npx.cmd
NODE_ROOT=$(find "$TEMP_DIR/node-extract" -name node.exe -type f -print -quit | xargs dirname)
if [ -z "$NODE_ROOT" ]; then
  echo "ERROR: node.exe not found in extracted zip."
  exit 1
fi

cp "$NODE_ROOT/node.exe" "$PACKAGE_DIR/node/node.exe"
cp "$NODE_ROOT/npm.cmd" "$PACKAGE_DIR/node/npm.cmd" 2>/dev/null || true
cp "$NODE_ROOT/npx.cmd" "$PACKAGE_DIR/node/npx.cmd" 2>/dev/null || true
cp -r "$NODE_ROOT/node_modules" "$PACKAGE_DIR/node/node_modules" 2>/dev/null || true
chmod +x "$PACKAGE_DIR/node/node.exe" 2>/dev/null || true

echo "Node.js v${NODE_VERSION} + npm ready."

# ──────────────────────────────────────────────────
# 3. Copy compiled server JS from Bazel output
# ──────────────────────────────────────────────────
echo "Packaging server..."

# Server compiled JS (tsc output, no test files)
mkdir -p "$PACKAGE_DIR/server"

# Copy all JS files from bazel-bin (Bazel outputs are read-only, use cp -f)
find "$ROOT_DIR/bazel-bin/apps/server/src" -name "*.js" -print0 | while IFS= read -r -d '' f; do
  rel="${f#$ROOT_DIR/bazel-bin/apps/server/src/}"
  mkdir -p "$PACKAGE_DIR/server/$(dirname "$rel")"
  cp -f "$f" "$PACKAGE_DIR/server/$rel"
  chmod 644 "$PACKAGE_DIR/server/$rel"
done

# Workspace packages (compiled JS)
mkdir -p "$PACKAGE_DIR/packages/shared"
mkdir -p "$PACKAGE_DIR/packages/db"

find "$ROOT_DIR/bazel-bin/packages/shared/src" -name "*.js" -print0 2>/dev/null | while IFS= read -r -d '' f; do
  rel="${f#$ROOT_DIR/bazel-bin/packages/shared/src/}"
  mkdir -p "$PACKAGE_DIR/packages/shared/$(dirname "$rel")"
  cp -f "$f" "$PACKAGE_DIR/packages/shared/$rel"
  chmod 644 "$PACKAGE_DIR/packages/shared/$rel"
done

find "$ROOT_DIR/bazel-bin/packages/db/src" -name "*.js" -print0 2>/dev/null | while IFS= read -r -d '' f; do
  rel="${f#$ROOT_DIR/bazel-bin/packages/db/src/}"
  mkdir -p "$PACKAGE_DIR/packages/db/$(dirname "$rel")"
  cp -f "$f" "$PACKAGE_DIR/packages/db/$rel"
  chmod 644 "$PACKAGE_DIR/packages/db/$rel"
done

# Drizzle migration SQL files
if [ -d "$ROOT_DIR/packages/db/drizzle" ]; then
  mkdir -p "$PACKAGE_DIR/server/migrations"
  cp -f "$ROOT_DIR/packages/db/drizzle/"*.sql "$PACKAGE_DIR/server/migrations/" 2>/dev/null || true
fi

# Create a workspace package.json for the server so npm install resolves deps
cat > "$PACKAGE_DIR/server/package.json" << 'PKGJSON'
{
  "name": "@spicyhome/server",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "main": "main.js",
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/event-emitter": "^2.0.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/serve-static": "^4.0.0",
    "@nestjs/swagger": "^7.4.0",
    "@noble/curves": "^1.9.7",
    "@noble/hashes": "^1.8.0",
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^11.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "drizzle-orm": "^0.33.0",
    "express": "^4.19.0",
    "reflect-metadata": "^0.1.14",
    "rxjs": "^7.8.0",
    "uuid": "^9.0.0"
  }
}
PKGJSON

echo "Server packaged."

# ──────────────────────────────────────────────────
# 4. Copy SPA dist
# ──────────────────────────────────────────────────
echo "Packaging SPA..."
rm -rf "$PACKAGE_DIR/pos"
if [ -d "$ROOT_DIR/bazel-bin/apps/pos/dist" ]; then
  cp -rf "$ROOT_DIR/bazel-bin/apps/pos/dist" "$PACKAGE_DIR/pos"
  chmod -R 755 "$PACKAGE_DIR/pos"
fi
echo "SPA packaged."

# ──────────────────────────────────────────────────
# 5. Create start-server.bat
# ──────────────────────────────────────────────────
cat > "$PACKAGE_DIR/start-server.bat" << 'BATEOF'
@echo off
setlocal enabledelayedexpansion

set "TZ=Asia/Riyadh"
set "SPA_DIST=%~dp0pos"
set "SPICYHOME_DB=%~dp0data\spicyhome.db"
set "PORT=3000"

echo ==========================================
echo   SpicyHome POS Server
echo ==========================================
echo.
echo Server:   %~dp0server\main.js
echo SPA:      %SPA_DIST%
echo Database: %SPICYHOME_DB%
echo Port:     %PORT%
echo.

REM Create data directory
if not exist "%~dp0data" mkdir "%~dp0data"

REM First run: install server dependencies (requires internet)
if not exist "%~dp0server\node_modules" (
    echo.
    echo ========================================
    echo   First run: installing dependencies...
    echo   This requires internet (one-time).
    echo ========================================
    echo.
    cd /d "%~dp0server"
    call "%~dp0node\npm.cmd" install --production --ignore-scripts
    if !ERRORLEVEL! NEQ 0 (
        echo ERROR: npm install failed.
        echo Try running: node\npm.cmd install --production --ignore-scripts
        pause
        exit /b 1
    )
    REM Rebuild better-sqlite3 for Windows
    call "%~dp0node\npm.cmd" rebuild better-sqlite3
    cd /d "%~dp0"
    echo.
    echo Dependencies installed successfully.
    echo.
)

echo Starting server...
"%~dp0node\node.exe" "%~dp0server\main.js"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server exited with error code %ERRORLEVEL%
    pause
)
BATEOF

echo "start-server.bat created."

# ──────────────────────────────────────────────────
# 6. Copy README.txt
# ──────────────────────────────────────────────────
cp "$SCRIPT_DIR/README.txt" "$PACKAGE_DIR/README.txt"

# ──────────────────────────────────────────────────
# 7. Zip
# ──────────────────────────────────────────────────
echo "Creating zip..."
# Fix permissions before zipping (Bazel outputs are read-only)
chmod -R u+w "$PACKAGE_DIR" 2>/dev/null || true
cd "$DIST_DIR"
rm -f spicyhome-pos-win7.zip
zip -r spicyhome-pos-win7.zip spicyhome-pos-win7/

echo ""
echo "=== Package ready: $DIST_DIR/spicyhome-pos-win7.zip ==="
echo ""
echo "Package size: $(du -sh spicyhome-pos-win7.zip | cut -f1)"
echo ""
echo "Contents:"
unzip -l spicyhome-pos-win7.zip | head -60

# Clean temp
rm -rf "$TEMP_DIR"
