#!/usr/bin/env bash
# Create (or refresh) a git worktree ready for parallel debug.
#
# Usage:
#   scripts/setup-worktree.sh <branch> [path]
#   scripts/setup-worktree.sh --env-only [path]
#
# Examples:
#   scripts/setup-worktree.sh feat/login
#     → ../spicyhome-ksa-feat-login (sibling dir) on branch feat/login
#   scripts/setup-worktree.sh feat/login /tmp/sh-login
#   scripts/setup-worktree.sh --env-only
#     → only (re)write .env.worktree + ensure data/ in current repo

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_ONLY=false
FORCE_ENV=false
BRANCH=""
WT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-only) ENV_ONLY=true; shift ;;
    --force-env) FORCE_ENV=true; shift ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      if [[ -z "$BRANCH" && "$ENV_ONLY" == false ]]; then
        BRANCH="$1"
      elif [[ -z "$WT_PATH" ]]; then
        WT_PATH="$1"
      else
        echo "Error: unexpected argument: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

run_env() {
  local target="$1"
  local args=()
  if $FORCE_ENV; then
    args+=(--force)
  fi
  bash "$ROOT/scripts/worktree-env.sh" "${args[@]}" "$target"
}

if $ENV_ONLY; then
  target="${WT_PATH:-$ROOT}"
  run_env "$target"
  exit 0
fi

if [[ -z "$BRANCH" ]]; then
  echo "Usage: scripts/setup-worktree.sh <branch> [path]" >&2
  echo "       scripts/setup-worktree.sh --env-only [path]" >&2
  exit 1
fi

# Default path: sibling directory named from branch slug.
if [[ -z "$WT_PATH" ]]; then
  slug="$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  parent="$(dirname "$ROOT")"
  base="$(basename "$ROOT")"
  WT_PATH="${parent}/${base}-${slug}"
fi

if [[ -e "$WT_PATH" ]]; then
  echo "Path exists: $WT_PATH"
  if [[ ! -e "$WT_PATH/.git" ]]; then
    echo "Error: path exists but is not a git worktree" >&2
    exit 1
  fi
else
  # Create branch from HEAD if it does not exist yet.
  if git -C "$ROOT" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git -C "$ROOT" worktree add "$WT_PATH" "$BRANCH"
  elif git -C "$ROOT" show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
    git -C "$ROOT" worktree add --track -b "$BRANCH" "$WT_PATH" "origin/${BRANCH}"
  else
    git -C "$ROOT" worktree add -b "$BRANCH" "$WT_PATH"
  fi
fi

run_env "$WT_PATH"

echo "Installing dependencies (pnpm)..."
if command -v pnpm >/dev/null 2>&1; then
  (cd "$WT_PATH" && pnpm install)
else
  echo "Warning: pnpm not found — skip install" >&2
fi

echo
echo "Worktree ready: $WT_PATH"
echo "  code \"$WT_PATH\""
echo "  Then Run and Debug → \"Debug Server + POS\""
