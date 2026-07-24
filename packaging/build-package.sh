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
# to download server dependencies. The Windows-native better-sqlite3 binary
# is pre-bundled so the target machine does not need a C++ toolchain.

NODE_VERSION="18.20.5"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
NODE_SHA256="910237449895b4de61026568dc076fa6c3ffcd667563ed03112a4a77e1f1556b"

# Pre-built better-sqlite3 native binary for Node 18 ABI (v108) on Windows
# x64. Checked into the repo to avoid network downloads during packaging and
# to avoid requiring a C++ toolchain on the target Windows 7 machine.
# Update this file when bumping better-sqlite3:
#   packaging/prebuilt/better_sqlite3.node
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BETTER_SQLITE3_PREBUILT="$SCRIPT_DIR/prebuilt/better_sqlite3.node"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_DIR="$DIST_DIR/spicyhome-pos-win7"
TEMP_DIR="$DIST_DIR/.tmp"

echo "=== SpicyHome POS Windows 7 Package Builder ==="
echo "Root: $ROOT_DIR"

PACKAGE_VERSION=$(cat "$ROOT_DIR/VERSION" | tr -d '[:space:]')
echo "Package version: $PACKAGE_VERSION"

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

# Create package.json files from source, then fix them up:
# - strip scripts & devDependencies
# - convert workspace:* deps to file: references
# - fix main field for compiled JS
cp "$ROOT_DIR/apps/server/package.json" "$PACKAGE_DIR/server/package.json"
cp "$ROOT_DIR/packages/shared/package.json" "$PACKAGE_DIR/packages/shared/package.json"
cp "$ROOT_DIR/packages/db/package.json" "$PACKAGE_DIR/packages/db/package.json"

node "$SCRIPT_DIR/fixup-packages.js" "$PACKAGE_DIR"

echo "Server packaged."

# ──────────────────────────────────────────────────
# 4. Bundle better-sqlite3 native binary for Windows x64 / Node 18
# ──────────────────────────────────────────────────
# We ship the precompiled native module so that npm install on the target
# machine does not need a C++ toolchain to rebuild better-sqlite3.
# It is placed OUTSIDE server/node_modules because npm install will wipe
# that directory on first run; the PS script copies it in after npm install.
echo "Bundling better-sqlite3 prebuilt binary..."
mkdir -p "$PACKAGE_DIR/prebuilt"
cp "$BETTER_SQLITE3_PREBUILT" "$PACKAGE_DIR/prebuilt/better_sqlite3.node"
echo "better-sqlite3 native binary bundled."

# ──────────────────────────────────────────────────
# 5. Copy SPA dist
# ──────────────────────────────────────────────────
echo "Packaging SPA..."
rm -rf "$PACKAGE_DIR/pos"
if [ -d "$ROOT_DIR/bazel-bin/apps/pos/dist" ]; then
  cp -rf "$ROOT_DIR/bazel-bin/apps/pos/dist" "$PACKAGE_DIR/pos"
  chmod -R 755 "$PACKAGE_DIR/pos"
fi
echo "SPA packaged."

# ──────────────────────────────────────────────────
# 6. Create PowerShell script + cmd wrapper
# ──────────────────────────────────────────────────
# We use a PowerShell script for the real logic because cmd.exe on Windows 7
# is extremely sensitive to parentheses, colons, and quoting inside batch
# blocks and is prone to cryptic parse errors such as:
#   ". was unexpected at this time."
# The generated .bat is only a thin wrapper that launches the .ps1 with the
# execution policy bypassed for convenience.

cat > "$PACKAGE_DIR/start-server.ps1" << 'PSEOF'
$ErrorActionPreference = "Stop"

# Node 18 prints "Windows 8.1 or higher required" on Windows 7 unless we
# opt out of the platform check. This environment variable makes Node 18
# run on Windows 7 as documented in Node release notes.
$env:NODE_SKIP_PLATFORM_CHECK = "1"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:TZ = "Asia/Riyadh"
$env:SPA_DIST = Join-Path $scriptDir "pos"
$env:SPICYHOME_DB = Join-Path $scriptDir "data\spicyhome.db"
$env:PORT = "3742"

Write-Host "=========================================="
Write-Host "  SpicyHome POS Server"
Write-Host "=========================================="
Write-Host ""
Write-Host "Server:   $(Join-Path $scriptDir 'server\main.js')"
Write-Host "SPA:      $($env:SPA_DIST)"
Write-Host "Database: $($env:SPICYHOME_DB)"
Write-Host "Port:     $($env:PORT)"
Write-Host ""

# Create data directory
$dataDir = Join-Path $scriptDir "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

# First run: install server dependencies (requires internet)
$nodeModules = Join-Path $scriptDir "server\node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "  First run: installing dependencies..."
    Write-Host "  This requires internet (one-time)."
    Write-Host "========================================"
    Write-Host ""

    $serverDir = Join-Path $scriptDir "server"
    $npmCmd = Join-Path $scriptDir "node\npm.cmd"

    $installArgs = @("install", "--production", "--ignore-scripts")
    $installProcess = Start-Process -FilePath $npmCmd -ArgumentList $installArgs -WorkingDirectory $serverDir -Wait -NoNewWindow -PassThru
    if ($installProcess.ExitCode -ne 0) {
        Write-Host "ERROR: npm install failed." -ForegroundColor Red
        Write-Host "Try running: node\npm.cmd install --production --ignore-scripts"
        Read-Host "Press Enter to exit"
        exit 1
    }

    # better-sqlite3's native binary is pre-bundled at prebuilt/better_sqlite3.node.
    # npm install wipes server/node_modules so we copy it in afterwards.
    $prebuiltBin = Join-Path $scriptDir "prebuilt\better_sqlite3.node"
    $targetDir = Join-Path $serverDir "node_modules\better-sqlite3\build\Release"
    if (Test-Path $prebuiltBin) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        Copy-Item $prebuiltBin (Join-Path $targetDir "better_sqlite3.node") -Force
    }

    Write-Host ""
    Write-Host "Dependencies installed successfully."
    Write-Host ""
}

Write-Host "Starting server..."
$nodeExe = Join-Path $scriptDir "node\node.exe"
$mainJs = Join-Path $scriptDir "server\main.js"
$process = Start-Process -FilePath $nodeExe -ArgumentList $mainJs -WorkingDirectory $scriptDir -Wait -NoNewWindow -PassThru

if ($process.ExitCode -ne 0) {
    Write-Host ""
    Write-Host "Server exited with error code $($process.ExitCode)"
    Read-Host "Press Enter to exit"
}
PSEOF

cat > "$PACKAGE_DIR/start-server.bat" << 'BATEOF'
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" %*
BATEOF

# Ensure line endings are Windows CRLF for readability on Notepad/Windows 7.
for f in "$PACKAGE_DIR/start-server.bat" "$PACKAGE_DIR/start-server.ps1"; do
  sed 's/$/\r/' "$f" > "$f.crlf"
  mv "$f.crlf" "$f"
done

echo "start-server.bat and start-server.ps1 created."

# ──────────────────────────────────────────────────
# 7. Copy README.txt
# ──────────────────────────────────────────────────
cp "$SCRIPT_DIR/README.txt" "$PACKAGE_DIR/README.txt"

# ──────────────────────────────────────────────────
# 8. Zip
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

# Clean temp
rm -rf "$TEMP_DIR"
