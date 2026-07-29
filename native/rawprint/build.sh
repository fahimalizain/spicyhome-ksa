#!/bin/bash
set -euo pipefail

# Build rawprint.exe for Windows x64, targeting the GNU ABI (MinGW-w64).
#
# Prerequisites:
#   - Rust 1.77.2 toolchain with x86_64-pc-windows-gnu target
#   - MinGW-w64 GCC (x86_64-w64-mingw32-gcc) on PATH
#   - Optional: CARGO_HOME and RUSTUP_HOME set for repo-local toolchain
#
# Usage:
#   ./build.sh
#
# Output:
#   packaging/prebuilt/rawprint.exe

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Use repo-local toolchain if available
if [ -f "$ROOT_DIR/.cargo/env" ]; then
  export CARGO_HOME="${CARGO_HOME:-$ROOT_DIR/.cargo}"
  export RUSTUP_HOME="${RUSTUP_HOME:-$ROOT_DIR/.rustup}"
  source "$CARGO_HOME/env"
fi

echo "Building rawprint.exe (x86_64-pc-windows-gnu)..."

cd "$SCRIPT_DIR"
cargo build --release --target x86_64-pc-windows-gnu

OUTPUT_DIR="$ROOT_DIR/packaging/prebuilt"
mkdir -p "$OUTPUT_DIR"

cp target/x86_64-pc-windows-gnu/release/rawprint.exe "$OUTPUT_DIR/rawprint.exe"

echo ""
echo "Done: $OUTPUT_DIR/rawprint.exe"
echo "Size: $(du -sh "$OUTPUT_DIR/rawprint.exe" | cut -f1)"
echo "Type: $(file "$OUTPUT_DIR/rawprint.exe")"
