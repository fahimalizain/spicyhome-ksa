#!/usr/bin/env bash
# Tear down a linked SpicyHome git worktree: stop local processes, drop the
# Bazel output base (~1.5G), remove the worktree-local SQLite DB, then
# git worktree remove.
#
# Lives in: .agents/skills/worktree/scripts/delete.sh
# Compatible with macOS Bash 3.2.
#
# Usage:
#   delete.sh /path/to/wt
#   delete.sh .                         # cwd must be the linked wt
#   delete.sh /path/to/wt --force       # dirty tree / locked
#   delete.sh /path/to/wt --delete-branch
#   delete.sh /path/to/wt --keep-db
#   delete.sh /path/to/wt --dry-run
#
# Exit codes:
#   0  success
#   1  failure mid-teardown
#   2  usage / refused (main worktree, unknown path, etc.)

set -euo pipefail

FORCE=false
DELETE_BRANCH=false
KEEP_DB=false
DRY_RUN=false
TARGET=""

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \?//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=true; shift ;;
    --delete-branch) DELETE_BRANCH=true; shift ;;
    --keep-db) KEEP_DB=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    -*)
      echo "Error: unknown flag: $1" >&2
      exit 2
      ;;
    *)
      if [ -n "$TARGET" ]; then
        echo "Error: unexpected argument: $1" >&2
        exit 2
      fi
      TARGET="$1"
      shift
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  TARGET="."
fi

if [ ! -e "$TARGET" ]; then
  echo "Error: path does not exist: $TARGET" >&2
  exit 2
fi

WT="$(cd "$TARGET" && pwd -P)"

if [ ! -e "$WT/.git" ]; then
  echo "Error: not a git checkout: $WT" >&2
  exit 2
fi

# Main worktree has .git as a directory; linked worktrees have .git as a file.
if [ -d "$WT/.git" ]; then
  echo "Error: refusing to delete the main worktree: $WT" >&2
  exit 2
fi

GIT_COMMON="$(git -C "$WT" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -z "$GIT_COMMON" ]; then
  echo "Error: cannot resolve git common dir for $WT" >&2
  exit 2
fi
GIT_COMMON="$(cd "$WT" && cd "$GIT_COMMON" && pwd -P)"
MAIN_ROOT="$(dirname "$GIT_COMMON")"
if [ "$(basename "$GIT_COMMON")" = ".git" ]; then
  MAIN_ROOT="$(dirname "$GIT_COMMON")"
fi

REGISTERED=false
while IFS= read -r line; do
  p="${line%/}"
  if [ "$p" = "$WT" ]; then
    REGISTERED=true
    break
  fi
done <<EOF
$(git -C "$MAIN_ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}')
EOF

if [ "$REGISTERED" != true ]; then
  echo "Error: not a registered worktree of $MAIN_ROOT: $WT" >&2
  exit 2
fi

BRANCH="$(git -C "$WT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
SLUG=""
DB_PATH=""
if [ -f "$WT/.env.worktree" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$WT/.env.worktree"
  set +a
  SLUG="${WORKTREE_SLUG:-}"
  DB_PATH="${SPICYHOME_DB:-}"
fi

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] $*"
    return 0
  fi
  "$@"
}

echo "Delete worktree"
echo "  path:     $WT"
echo "  main:     $MAIN_ROOT"
echo "  branch:   ${BRANCH:-?}"
echo "  slug:     ${SLUG:-?}"
echo "  db:       ${DB_PATH:-none}"
echo "  force:    $FORCE"
echo "  delbranch:$DELETE_BRANCH"
echo "  dry-run:  $DRY_RUN"
echo

# ── 1. Kill processes bound to this worktree ─────────────────────────────
echo "==> Stopping processes for this worktree"

kill_pid() {
  _pid="$1"
  [ -n "$_pid" ] || return 0
  if ! kill -0 "$_pid" 2>/dev/null; then
    return 0
  fi
  echo "  kill $_pid"
  if [ "$DRY_RUN" = true ]; then
    return 0
  fi
  kill "$_pid" 2>/dev/null || true
  sleep 0.5
  if kill -0 "$_pid" 2>/dev/null; then
    kill -9 "$_pid" 2>/dev/null || true
  fi
}

for pid in $(pgrep -f 'A-server\.jar|--product_name=Bazel' 2>/dev/null || true); do
  [ -n "$pid" ] || continue
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [ -n "$cmd" ] || continue
  ws="$(printf '%s\n' "$cmd" | sed -n 's/.*--workspace_directory=\([^[:space:]]*\).*/\1/p' | head -1)"
  ws="${ws%/}"
  if [ "$ws" = "$WT" ]; then
    echo "  bazel pid=$pid workspace=$ws"
    kill_pid "$pid"
  fi
done

for pid in $(pgrep -f 'node|vite|tsx|jest|java' 2>/dev/null || true); do
  [ -n "$pid" ] || continue
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$cmd" in
    *opencode*|*Cursor*|*Code\ Helper*|*LanguageServer*|*tsserver*) continue ;;
  esac
  cwd="$(lsof -a -d cwd -p "$pid" -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}' || true)"
  cwd="${cwd%/}"
  case "$cwd" in
    "$WT"|"$WT"/*)
      case "$cmd" in
        *node*|*vite*|*tsx*|*jest*|*java*|*bazel*)
          echo "  proc pid=$pid cwd=$cwd"
          echo "    cmd: $(printf '%s' "$cmd" | cut -c1-120)"
          kill_pid "$pid"
          ;;
      esac
      ;;
  esac
done

# ── 2. Bazel clean --expunge ─────────────────────────────────────────────
echo "==> bazel clean --expunge"
if [ -f "$WT/MODULE.bazel" ] || [ -f "$WT/WORKSPACE" ] || [ -f "$WT/WORKSPACE.bazel" ]; then
  if command -v bazel >/dev/null 2>&1; then
    if [ "$DRY_RUN" = true ]; then
      echo "  [dry-run] (cd $WT && bazel clean --expunge)"
    else
      (cd "$WT" && bazel clean --expunge) || echo "  warning: bazel clean --expunge failed (will try output-base sweep)"
    fi
  else
    echo "  warning: bazel not on PATH — skipping expunge"
  fi
else
  echo "  skip: no Bazel module/workspace markers"
fi

# ── 3. Sweep output base by workspace path ───────────────────────────────
echo "==> Sweep Bazel output base for this path"
BAZEL_USER_ROOT="${OUTPUT_USER_ROOT:-/private/var/tmp/_bazel_${USER}}"
if [ ! -d "$BAZEL_USER_ROOT" ]; then
  BAZEL_USER_ROOT="${OUTPUT_USER_ROOT:-/tmp/_bazel_${USER}}"
fi

remove_output_base() {
  _base="$1"
  echo "  rm -rf $_base"
  if [ "$DRY_RUN" = true ]; then
    return 0
  fi
  chmod -R u+w "$_base" 2>/dev/null || true
  if rm -rf "$_base" 2>/dev/null; then
    return 0
  fi
  echo "  warning: plain rm failed. Trying chmod -R a+w" >&2
  chmod -R a+w "$_base" 2>/dev/null || true
  rm -rf "$_base" || {
    echo "  error: could not delete $_base — run: sudo rm -rf '$_base'" >&2
    return 1
  }
}

FOUND_BASE=false
SEEN_BASES=""
if [ -d "$BAZEL_USER_ROOT" ]; then
  for marker in "$BAZEL_USER_ROOT"/*/DO_NOT_BUILD_HERE "$BAZEL_USER_ROOT"/*/execroot/DO_NOT_BUILD_HERE; do
    [ -f "$marker" ] || continue
    ws="$(tr -d '\n' <"$marker" 2>/dev/null || true)"
    ws="${ws%/}"
    if [ "$ws" != "$WT" ]; then
      continue
    fi
    base="$(dirname "$marker")"
    if [ "$(basename "$base")" = "execroot" ]; then
      base="$(dirname "$base")"
    fi
    bname="$(basename "$base")"
    if [ "$bname" = "install" ] || [ "$bname" = "cache" ]; then
      continue
    fi
    case "$SEEN_BASES" in
      *"|$base|"*) continue ;;
    esac
    SEEN_BASES="${SEEN_BASES}|$base|"
    FOUND_BASE=true
    remove_output_base "$base" || true
  done
fi
if [ "$FOUND_BASE" != true ]; then
  echo "  no output base found under $BAZEL_USER_ROOT (already clean)"
fi

# ── 4. Worktree-local SQLite DB ──────────────────────────────────────────
if [ "$KEEP_DB" != true ] && [ -n "$DB_PATH" ]; then
  echo "==> Remove worktree DB"
  case "$DB_PATH" in
    "$WT"/*)
      if [ -e "$DB_PATH" ] || [ -e "${DB_PATH}-wal" ] || [ -e "${DB_PATH}-shm" ]; then
        echo "  rm $DB_PATH (+ wal/shm)"
        run rm -f -- "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"
      else
        echo "  db already absent: $DB_PATH"
      fi
      ;;
    *)
      echo "  skip db (path outside worktree): $DB_PATH"
      ;;
  esac
fi

# ── 5. git worktree remove ───────────────────────────────────────────────
echo "==> git worktree remove"
if [ "$DRY_RUN" = true ]; then
  if [ "$FORCE" = true ]; then
    echo "  [dry-run] git -C $MAIN_ROOT worktree remove --force $WT"
  else
    echo "  [dry-run] git -C $MAIN_ROOT worktree remove $WT"
  fi
else
  cd "$MAIN_ROOT"
  if [ "$FORCE" = true ]; then
    git -C "$MAIN_ROOT" worktree remove --force "$WT"
  else
    git -C "$MAIN_ROOT" worktree remove "$WT"
  fi
fi

# ── 6. Optional branch delete ────────────────────────────────────────────
if [ "$DELETE_BRANCH" = true ] && [ -n "$BRANCH" ] && [ "$BRANCH" != "HEAD" ]; then
  echo "==> delete local branch $BRANCH"
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] git -C $MAIN_ROOT branch -d $BRANCH  (or -D if force)"
  else
    if [ "$FORCE" = true ]; then
      git -C "$MAIN_ROOT" branch -D "$BRANCH" || echo "  warning: branch delete failed"
    else
      git -C "$MAIN_ROOT" branch -d "$BRANCH" || {
        echo "  warning: branch -d failed (unmerged?). Re-run with --force --delete-branch for -D" >&2
      }
    fi
  fi
fi

echo
echo "Done."
if [ "$DRY_RUN" != true ]; then
  echo "  removed: $WT"
  if [ -d "$BAZEL_USER_ROOT" ]; then
    left=0
    for d in "$BAZEL_USER_ROOT"/*; do
      [ -d "$d" ] || continue
      b="$(basename "$d")"
      [ "$b" = "install" ] && continue
      [ "$b" = "cache" ] && continue
      left=$((left + 1))
    done
    echo "  bazel output bases remaining: $left"
  fi
fi
