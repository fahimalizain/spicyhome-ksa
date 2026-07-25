#!/usr/bin/env bash
# Bootstrap an already-created git worktree for parallel Server+POS debug.
#
# Does NOT create worktrees — your worktree manager owns checkout creation.
# This script only prepares the open checkout: .env.worktree + deps.
#
# Linked worktrees auto-inherit Sentry DSNs from the main worktree's
# .env.worktree.  Android apps/android/local.properties is synced from
# SENTRY_ANDROID_DSN (never server SENTRY_DSN).
#
# Usage:
#   scripts/worktree/bootstrap.sh              # current repo / worktree
#   scripts/worktree/bootstrap.sh /path/to/wt  # explicit checkout
#   scripts/worktree/bootstrap.sh --force-env  # rewrite .env.worktree
#   scripts/worktree/bootstrap.sh --skip-install
#   scripts/worktree/bootstrap.sh --env-only   # alias: env only, no install

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_VIA_SCRIPT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FORCE_ENV=false
SKIP_INSTALL=false
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-env) FORCE_ENV=true; shift ;;
    --skip-install|--env-only) SKIP_INSTALL=true; shift ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      if [[ -n "$TARGET" ]]; then
        echo "Error: unexpected argument: $1" >&2
        exit 1
      fi
      TARGET="$1"
      shift
      ;;
  esac
done

if [[ -n "$TARGET" ]]; then
  ROOT="$(cd "$TARGET" && pwd)"
else
  if ROOT="$(git -C "${PWD}" rev-parse --show-toplevel 2>/dev/null)"; then
    :
  else
    ROOT="$REPO_VIA_SCRIPT"
  fi
fi

if [[ ! -e "$ROOT/.git" ]]; then
  echo "Error: not a git checkout: $ROOT" >&2
  exit 1
fi

if [[ ! -f "$ROOT/scripts/worktree/env.sh" ]]; then
  echo "Error: missing scripts/worktree/env.sh in $ROOT" >&2
  exit 1
fi

echo "Bootstrapping worktree: $ROOT"

env_args=()
if $FORCE_ENV; then
  env_args+=(--force)
fi
bash "$ROOT/scripts/worktree/env.sh" "${env_args[@]}" "$ROOT"

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node not found on PATH" >&2
    echo "  This repo expects Node 24 (see .nvmrc). Example: nvm use" >&2
    exit 1
  fi
  local ver major
  ver="$(node -v)"
  major="${ver#v}"
  major="${major%%.*}"
  if [[ "$major" != "24" ]]; then
    echo "Error: Node 24 required for host tooling (got ${ver})." >&2
    echo "  .nvmrc pins 24.x — run: nvm use" >&2
    echo "  Node 18 fails some package engines; Node 26+ often breaks better-sqlite3 builds." >&2
    exit 1
  fi
  echo "Node ${ver} OK"
}

if ! $SKIP_INSTALL; then
  check_node
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "Error: pnpm not found on PATH" >&2
    exit 1
  fi
  echo "Installing dependencies (pnpm)..."
  (cd "$ROOT" && pnpm install)
else
  echo "Skipping pnpm install"
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source "$ROOT/.env.worktree"
set +a

echo
echo "Worktree ready: $ROOT"
echo "  API     http://localhost:${PORT}"
echo "  POS     http://localhost:${VITE_PORT}"
echo "  inspect ${INSPECT_PORT}"
echo "  db      ${SPICYHOME_DB}"
echo "  VS Code: open this folder → Run and Debug → \"Debug Server + POS\""
