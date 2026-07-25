#!/usr/bin/env bash
# Allocate stable per-worktree ports + DB path and write .env.worktree.
# Inherits Sentry DSNs from main worktree for linked worktrees.
# Syncs Android apps/android/local.properties from SENTRY_ANDROID_DSN.
#
# Does not create git worktrees. Prefer scripts/worktree/bootstrap.sh for a
# full cold-checkout bootstrap (env + Node check + pnpm install).
#
# Main worktree (directory .git): defaults PORT=3742, VITE_PORT=6124.
# Linked worktrees: hash(realpath) → offset 1..999 so ports never collide
# with main and stay stable across restarts.
#
# Usage:
#   scripts/worktree/env.sh              # write .env.worktree in cwd/repo root
#   scripts/worktree/env.sh --print      # print env without writing
#   scripts/worktree/env.sh --force      # overwrite existing .env.worktree
#   scripts/worktree/env.sh /path/to/wt  # target another checkout

set -euo pipefail

# ────────────────────────────────────────────────────────────────
#  Helpers
# ────────────────────────────────────────────────────────────────

# Find the main worktree path (the one where .git is a directory).
# Reads: $ROOT (set in main flow)
# Returns: path or empty string on failure.
find_main_worktree() {
  local line wt_path
  while IFS= read -r line; do
    if [[ "$line" =~ ^worktree\ (.*) ]]; then
      wt_path="${BASH_REMATCH[1]}"
      if [[ -d "$wt_path/.git" ]]; then
        echo "$wt_path"
        return 0
      fi
    fi
  done < <(git -C "${ROOT}" worktree list --porcelain 2>/dev/null)
  return 1
}

# Read a single key from a .env-style file.
# Usage: read_env_key <file> <key>
# Prints the value (without quotes) or empty string if not found.
read_env_key() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then
    return 1
  fi
  # Match KEY=VALUE; strip quotes but preserve values with spaces/special chars.
  local val
  val="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1)" || return 1
  val="${val#*=}"
  # Strip surrounding single/double quotes if present
  if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"; fi
  if [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
  echo "$val"
}

# Sentry keys eligible for inheritance from main → linked.
# Explicitly excludes SENTRY_AUTH_TOKEN (CI-only), environment keys
# (worktree-local), and runtime keys (PORT, VITE_PORT, etc.).
SENTRY_ALLOWLIST=(
  SENTRY_DSN
  SENTRY_ANDROID_DSN
  VITE_SENTRY_DSN
  SENTRY_TRACES_SAMPLE_RATE
  SENTRY_PROFILES_SAMPLE_RATE
  VITE_SENTRY_TRACES_SAMPLE_RATE
  SENTRY_ORG
  SENTRY_URL
)

# Inherit Sentry values from main .env.worktree into shell variables.
# Call after MAIN_ROOT is resolved and linked worktree is confirmed.
inherit_sentry_vars() {
  local main_env="$MAIN_ROOT/.env.worktree"
  if [[ ! -f "$main_env" ]]; then
    return 0
  fi
  local key val
  for key in "${SENTRY_ALLOWLIST[@]}"; do
    val="$(read_env_key "$main_env" "$key")" || true
    if [[ -n "$val" ]]; then
      printf -v "$key" '%s' "$val"
    fi
  done
}

# Merge missing Sentry keys from main .env.worktree into the existing local
# .env.worktree.  Only appends keys that are absent or empty in the local file.
# Does NOT overwrite existing non-empty values.
merge_sentry_from_main() {
  local main_env="$MAIN_ROOT/.env.worktree"
  if [[ ! -f "$main_env" ]]; then
    echo "  [sentry] main .env.worktree not found at $MAIN_ROOT — skipping inheritance" >&2
    return 0
  fi

  local key existing_val main_val changed=false
  for key in "${SENTRY_ALLOWLIST[@]}"; do
    existing_val="$(read_env_key "$ENV_FILE" "$key")" || true
    if [[ -z "$existing_val" ]]; then
      main_val="$(read_env_key "$main_env" "$key")" || true
      if [[ -n "$main_val" ]]; then
        echo "${key}=${main_val}" >> "$ENV_FILE"
        changed=true
      fi
    fi
  done

  if $changed; then
    echo "  [sentry] inherited missing keys from main .env.worktree" >&2
    # Re-source so shell picks up newly added vars (needed for android sync)
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

# Emit the Sentry section of .env.worktree (writes to stdout).
# Reads shell variables set by inherit_sentry_vars (or manually).
emit_sentry_section() {
  # Header
  if $IS_MAIN; then
    echo "# ── Sentry error monitoring (uncomment and set DSN to enable) ──"
  else
    if [[ -n "${SENTRY_DSN:-}${VITE_SENTRY_DSN:-}${SENTRY_ANDROID_DSN:-}" ]]; then
      echo "# ── Sentry (inherited from main worktree) ──"
    else
      echo "# ── Sentry error monitoring (uncomment and set DSN to enable) ──"
    fi
  fi

  # DSNs and rates: active if set, commented template if not
  local pair key default_val val
  for pair in \
    "SENTRY_DSN:https://..." \
    "SENTRY_ANDROID_DSN:https://..." \
    "VITE_SENTRY_DSN:https://..." \
    "SENTRY_TRACES_SAMPLE_RATE:1.0" \
    "SENTRY_PROFILES_SAMPLE_RATE:1.0" \
    "VITE_SENTRY_TRACES_SAMPLE_RATE:1.0" \
    "SENTRY_ORG:" \
    "SENTRY_URL:"
  do
    key="${pair%%:*}"
    default_val="${pair#*:}"
    val="${!key:-}"
    if [[ -n "$val" ]]; then
      echo "${key}=${val}"
    else
      echo "# ${key}=${default_val}"
    fi
  done

  # Environment: always active for linked (slug), commented template for main
  if $IS_MAIN; then
    echo "# SENTRY_ENVIRONMENT=development"
    echo "# VITE_SENTRY_ENVIRONMENT=development"
  else
    echo "SENTRY_ENVIRONMENT=${SENTRY_ENVIRONMENT:-$SLUG}"
    echo "VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT:-$SLUG}"
  fi
}

# ────────────────────────────────────────────────────────────────
#  Android local.properties sync
# ────────────────────────────────────────────────────────────────

sync_android_local_properties() {
  local props="$ROOT/apps/android/local.properties"
  local android_dsn="${SENTRY_ANDROID_DSN:-}"
  local sentry_env="${SENTRY_ENVIRONMENT:-${WORKTREE_SLUG:-development}}"

  mkdir -p "$(dirname "$props")"

  local has_sdk_dir=false

  {
    echo "# Managed Sentry keys by scripts/worktree — do not commit"

    # Preserve non-Sentry lines from existing file
    if [[ -f "$props" ]]; then
      local line
      while IFS= read -r line; do
        # Skip old managed header lines
        if [[ "$line" == "# Managed Sentry keys"* ]]; then
          continue
        fi
        # Skip SENTRY_* lines (will be rewritten below)
        if [[ "$line" =~ ^SENTRY_ ]]; then
          continue
        fi
        # Keep everything else
        echo "$line"
        if [[ "$line" =~ ^sdk\.dir= ]]; then
          has_sdk_dir=true
        fi
      done < "$props"
    fi

    # If no sdk.dir and ANDROID_HOME is set, add it
    if ! $has_sdk_dir && [[ -n "${ANDROID_HOME:-}" ]]; then
      echo "sdk.dir=${ANDROID_HOME}"
    fi

    # Upsert Sentry keys if Android DSN is configured
    if [[ -n "$android_dsn" ]]; then
      echo "SENTRY_DSN=${android_dsn}"
      echo "SENTRY_ENVIRONMENT=${sentry_env}"
    fi
  } > "${props}.tmp" && mv "${props}.tmp" "$props"
}

print_android_status() {
  local android_dsn="${SENTRY_ANDROID_DSN:-}"
  if [[ -n "$android_dsn" ]]; then
    echo "Android local.properties: synced (SENTRY_DSN present)"
  else
    echo "Android local.properties: synced (SENTRY_DSN removed — set SENTRY_ANDROID_DSN in main .env.worktree for Android Sentry)"
  fi
}

print_sentry_status() {
  local server_status="off" pos_status="off" android_status="off"
  if [[ -n "${SENTRY_DSN:-}" ]]; then
    server_status="on"
  else
    server_status="off"
  fi
  if [[ -n "${VITE_SENTRY_DSN:-}" ]]; then
    pos_status="on"
  else
    pos_status="off"
  fi
  if [[ -n "${SENTRY_ANDROID_DSN:-}" ]]; then
    android_status="on"
  else
    android_status="off"
  fi
  echo "Sentry: server=${server_status} pos=${pos_status} android=${android_status} (from .env.worktree)"
}

# ────────────────────────────────────────────────────────────────
#  Main
# ────────────────────────────────────────────────────────────────

PRINT_ONLY=false
FORCE=false
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --print) PRINT_ONLY=true; shift ;;
    --force) FORCE=true; shift ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \?//'
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
  # Prefer git toplevel when inside a worktree; else script-relative repo root.
  if ROOT="$(git -C "${PWD}" rev-parse --show-toplevel 2>/dev/null)"; then
    :
  else
    ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  fi
fi

cd "$ROOT"

slug_from_branch() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo worktree)"
  if [[ "$branch" == "HEAD" ]]; then
    branch="$(git rev-parse --short HEAD 2>/dev/null || echo detached)"
  fi
  # filesystem-safe slug
  echo "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
}

# Stable 32-bit-ish hash → 1..999 (never 0 — reserved for main defaults).
path_offset() {
  local path="$1"
  local h
  h="$(printf '%s' "$path" | cksum | awk '{print $1}')"
  echo $(( (h % 999) + 1 ))
}

SLUG="$(slug_from_branch)"
IS_MAIN=false
if [[ -d "$ROOT/.git" ]]; then
  IS_MAIN=true
fi

if $IS_MAIN; then
  PORT=3742
  VITE_PORT=6124
  INSPECT_PORT=9229
  SPICYHOME_DB="$ROOT/data/spicyhome.db"
  WORKTREE_KIND=main
  OFFSET=0
else
  OFFSET="$(path_offset "$ROOT")"
  PORT=$((3742 + OFFSET))
  VITE_PORT=$((6124 + OFFSET))
  INSPECT_PORT=$((9229 + OFFSET))
  SPICYHOME_DB="$ROOT/data/spicyhome-${SLUG}.db"
  WORKTREE_KIND=linked
fi

ENV_FILE="$ROOT/.env.worktree"
MAIN_ROOT=""
if ! $IS_MAIN; then
  MAIN_ROOT="$(find_main_worktree)" || true
fi

# ── render (.env.worktree content) ──
render() {
  cat <<EOF
# Generated by scripts/worktree/env.sh — do not commit.
# kind=${WORKTREE_KIND} slug=${SLUG} offset=${OFFSET}
PORT=${PORT}
VITE_PORT=${VITE_PORT}
INSPECT_PORT=${INSPECT_PORT}
SPICYHOME_DB=${SPICYHOME_DB}
WORKTREE_SLUG=${SLUG}
TZ=Asia/Riyadh
EOF
  emit_sentry_section
}

# ── print-only ──
if $PRINT_ONLY; then
  if ! $IS_MAIN && [[ -n "$MAIN_ROOT" ]]; then
    inherit_sentry_vars
  fi
  if ! $IS_MAIN; then
    SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-$SLUG}"
    VITE_SENTRY_ENVIRONMENT="${VITE_SENTRY_ENVIRONMENT:-$SLUG}"
  fi
  render
  exit 0
fi

# ── file already exists, no force → merge + android sync, then exit ──
if [[ -f "$ENV_FILE" ]] && ! $FORCE; then
  echo "Exists: $ENV_FILE (use --force to overwrite)"
  # shellcheck disable=SC1090
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
  echo "  PORT=${PORT:-?}  VITE_PORT=${VITE_PORT:-?}  DB=${SPICYHOME_DB:-?}"

  # Merge missing Sentry keys from main (linked worktrees only)
  if ! $IS_MAIN && [[ -n "$MAIN_ROOT" ]]; then
    merge_sentry_from_main
  fi

  # Sync Android local.properties
  sync_android_local_properties
  print_android_status
  exit 0
fi

# ── write new .env.worktree (first time or --force) ──
mkdir -p "$ROOT/data"

# Inherit Sentry values from main for linked worktrees
if ! $IS_MAIN && [[ -n "$MAIN_ROOT" ]]; then
  inherit_sentry_vars
fi

# Set environment to slug for linked worktrees (not inherited from main)
if ! $IS_MAIN; then
  SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-$SLUG}"
  VITE_SENTRY_ENVIRONMENT="${VITE_SENTRY_ENVIRONMENT:-$SLUG}"
fi

render > "$ENV_FILE"
echo "Wrote $ENV_FILE"
echo "  kind=${WORKTREE_KIND}  slug=${SLUG}  offset=${OFFSET}"
echo "  server  http://localhost:${PORT}"
echo "  pos     http://localhost:${VITE_PORT}"
echo "  inspect ${INSPECT_PORT}"
echo "  db      ${SPICYHOME_DB}"

# Source newly-written file so android sync can read SENTRY_ANDROID_DSN
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

sync_android_local_properties
print_sentry_status
print_android_status
