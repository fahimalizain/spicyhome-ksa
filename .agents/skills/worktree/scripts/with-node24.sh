#!/usr/bin/env bash
# Prepend Node 24 (from .nvmrc / nvm) to PATH, then exec.
# Used by VS Code launch configs so GUI-launched debug does not pick
# Homebrew Node 26+ (breaks better-sqlite3 native ABI).
#
# Lives in: .agents/skills/worktree/scripts/with-node24.sh
#
# Usage:
#   bash .agents/skills/worktree/scripts/with-node24.sh node -e 'console.log(process.version)'
#   bash .agents/skills/worktree/scripts/with-node24.sh pnpm exec vite

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Prefer git toplevel from cwd (VS Code launch cwd is apps/*); fall back to skill→repo.
if ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
fi
WANT="$(tr -d '[:space:]' <"$ROOT/.nvmrc" 2>/dev/null || echo 24)"
# major or full — nvm paths use full when present
MAJOR="${WANT%%.*}"

resolve_node_dir() {
  local ver="$1"
  local candidates=(
    "${NVM_DIR:-$HOME/.nvm}/versions/node/v${ver}/bin"
    "$HOME/.nvm/versions/node/v${ver}/bin"
  )
  local d
  for d in "${candidates[@]}"; do
    if [[ -x "$d/node" ]]; then
      echo "$d"
      return 0
    fi
  done

  # Any installed vMAJOR.x.y (prefer highest via ls sort)
  local base="${NVM_DIR:-$HOME/.nvm}/versions/node"
  if [[ -d "$base" ]]; then
    local match
    match="$(ls -1 "$base" 2>/dev/null | grep -E "^v${MAJOR}\." | sort -V | tail -1 || true)"
    if [[ -n "$match" && -x "$base/$match/bin/node" ]]; then
      echo "$base/$match/bin"
      return 0
    fi
  fi

  # fnm
  if command -v fnm >/dev/null 2>&1; then
    local fnm_prefix
    fnm_prefix="$(fnm env --shell bash 2>/dev/null | sed -n 's/.*PATH="\([^:]*\):.*/\1/p' | head -1 || true)"
    if [[ -n "$fnm_prefix" && -x "$fnm_prefix/node" ]]; then
      local v
      v="$("$fnm_prefix/node" -v 2>/dev/null || true)"
      if [[ "$v" == v${MAJOR}.* ]]; then
        echo "$fnm_prefix"
        return 0
      fi
    fi
  fi

  # PATH already correct
  if command -v node >/dev/null 2>&1; then
    local v
    v="$(node -v)"
    if [[ "$v" == v${MAJOR}.* ]]; then
      dirname "$(command -v node)"
      return 0
    fi
  fi

  return 1
}

NODE_DIR="$(resolve_node_dir "$WANT" || true)"
if [[ -z "${NODE_DIR}" ]]; then
  echo "Error: Node ${WANT} (major ${MAJOR}) not found." >&2
  echo "  Install via nvm: nvm install \$(cat .nvmrc) && nvm use" >&2
  echo "  VS Code inherits a minimal PATH (often Homebrew node) — this wrapper fixes debug launches." >&2
  exit 1
fi

export PATH="${NODE_DIR}:${PATH}"

if [[ $# -eq 0 ]]; then
  echo "PATH node: $(command -v node) ($(node -v))"
  exit 0
fi

exec "$@"
