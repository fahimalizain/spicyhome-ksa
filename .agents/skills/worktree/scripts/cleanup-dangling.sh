#!/usr/bin/env bash
# Find (and optionally kill) dangling Bazel/Java/Node processes left by
# SpicyHome worktrees that were removed without delete.sh. Optionally sweep
# orphan Bazel output bases (~1.5G each).
#
# Lives in: .agents/skills/worktree/scripts/cleanup-dangling.sh
# Compatible with macOS Bash 3.2.
#
# Usage:
#   cleanup-dangling.sh                         # report only
#   cleanup-dangling.sh --kill                  # kill dangling procs only
#   cleanup-dangling.sh --kill-all-bazel        # also stop active worktree servers
#   cleanup-dangling.sh --sweep-output-bases    # report orphan output bases
#   cleanup-dangling.sh --sweep-output-bases --kill  # kill procs + delete orphan bases
#   cleanup-dangling.sh --json
#   cleanup-dangling.sh --dry-run
#
# Exit codes:
#   0  nothing dangling (or cleanup succeeded)
#   1  dangling found (report mode) / cleanup failed
#   2  usage / environment error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

DO_KILL=false
KILL_ALL_BAZEL=false
SWEEP_BASES=false
JSON=false
DRY_RUN=false

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \?//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --kill) DO_KILL=true; shift ;;
    --kill-all-bazel) DO_KILL=true; KILL_ALL_BAZEL=true; shift ;;
    --sweep-output-bases) SWEEP_BASES=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --json) JSON=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Error: unexpected argument: $1" >&2
      exit 2
      ;;
  esac
done

resolve_main_root() {
  _start="${1:-$PWD}"
  if ! git -C "$_start" rev-parse --git-common-dir >/dev/null 2>&1; then
    return 1
  fi
  _tl="$(git -C "$_start" rev-parse --show-toplevel 2>/dev/null || true)"
  _common="$(git -C "$_start" rev-parse --git-common-dir)"
  _common="$(cd "${_tl:-$_start}" && cd "$_common" && pwd -P)"
  if [ "$(basename "$_common")" = ".git" ]; then
    dirname "$_common"
  else
    dirname "$_common"
  fi
}

REPO_ROOT="$(resolve_main_root "$PWD" || true)"
if [ -z "${REPO_ROOT:-}" ]; then
  local_try="$(cd "$SCRIPT_DIR/../../../.." && pwd -P)"
  if [ -f "$local_try/MODULE.bazel" ] || [ -d "$local_try/.git" ]; then
    REPO_ROOT="$local_try"
  fi
fi
if [ -z "${REPO_ROOT:-}" ] || [ ! -d "$REPO_ROOT" ]; then
  echo "Error: cannot resolve SpicyHome repo root (run from a checkout)" >&2
  exit 2
fi

# Newline-separated list of registered worktree paths
KNOWN_WT="$(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}' | sed 's:/*$::')"

is_known_worktree() {
  _p="${1%/}"
  printf '%s\n' "$KNOWN_WT" | grep -Fxq -- "$_p"
}

is_hex32() {
  case "$1" in
    *[!0-9a-f]*|"") return 1 ;;
    *) [ "${#1}" -eq 32 ] ;;
  esac
}

# --- Collect Bazel servers ----------------------------------------------
# Rows: pid|name|workspace|status
BAZEL_ROWS=""
DANGLING_PIDS=""
ACTIVE_BAZEL_PIDS=""

for pid in $(pgrep -f 'A-server\.jar|--product_name=Bazel' 2>/dev/null || true); do
  [ -n "$pid" ] || continue
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [ -n "$cmd" ] || continue

  ws="$(printf '%s\n' "$cmd" | sed -n 's/.*--workspace_directory=\([^[:space:]]*\).*/\1/p' | head -1)"
  ws="${ws%/}"

  status="unknown"
  if [ -z "$ws" ]; then
    status="unknown"
  elif [ ! -d "$ws" ]; then
    status="dangling"
  elif is_known_worktree "$ws"; then
    status="active"
  else
    case "$ws" in
      *spicyhome*|*opencode/worktree*) status="dangling" ;;
      *) status="unknown" ;;
    esac
  fi

  name="bazel"
  bname="$(printf '%s\n' "$cmd" | sed -n 's/.*bazel(\([^)]*\)).*/\1/p' | head -1)"
  if [ -n "$bname" ]; then
    name="bazel($bname)"
  fi

  BAZEL_ROWS="${BAZEL_ROWS}${pid}|${name}|${ws}|${status}"$'\n'
  case "$status" in
    dangling)
      case " $DANGLING_PIDS " in
        *" $pid "*) ;;
        *) DANGLING_PIDS="${DANGLING_PIDS}${DANGLING_PIDS:+ }$pid" ;;
      esac
      ;;
    active)
      case " $ACTIVE_BAZEL_PIDS " in
        *" $pid "*) ;;
        *) ACTIVE_BAZEL_PIDS="${ACTIVE_BAZEL_PIDS}${ACTIVE_BAZEL_PIDS:+ }$pid" ;;
      esac
      ;;
  esac
done

# --- Collect SpicyHome-related Node processes ---------------------------
NODE_ROWS=""
NODE_DANGLING_PIDS=""

is_ide_noise() {
  case "$1" in
    *Visual\ Studio\ Code*|*Code\ Helper*|*Cursor.app*|*Electron*|*opencode*|*openchamber*|*agent-browser*|*Discord*) return 0 ;;
  esac
  return 1
}

for pid in $(pgrep -f 'node|vite|tsx|ts-node' 2>/dev/null || true); do
  [ -n "$pid" ] || continue
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [ -n "$cmd" ] || continue
  is_ide_noise "$cmd" && continue

  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/{print substr($0,2); exit}' || true)"

  related=false
  reason=""
  case "$cmd" in
    *spicyhome*|*@spicyhome*|*apps/server*|*apps/pos*)
      related=true
      reason="cmdline"
      ;;
  esac
  case "$cwd" in
    *spicyhome*|*opencode/worktree*)
      related=true
      if [ -n "$reason" ]; then
        reason="${reason}+cwd"
      else
        reason="cwd"
      fi
      ;;
  esac

  if [ "$related" = false ]; then
    case "$cmd" in
      *vite*|*tsx*|*ts-node*|*nest*)
        case "$cwd" in
          *spicyhome*|*opencode/worktree*)
            related=true
            reason="dev-server+cwd"
            ;;
        esac
        ;;
    esac
  fi

  [ "$related" = true ] || continue

  status="active"
  if [ -n "$cwd" ]; then
    if [ ! -d "$cwd" ]; then
      status="dangling"
    elif ! is_known_worktree "$cwd"; then
      probe="$cwd"
      matched=false
      while [ -n "$probe" ] && [ "$probe" != "/" ]; do
        if is_known_worktree "$probe"; then
          matched=true
          break
        fi
        probe="$(dirname "$probe")"
      done
      if [ "$matched" = false ]; then
        case "$cwd" in
          *opencode/worktree*|*spicyhome*) status="dangling" ;;
        esac
      fi
    fi
  fi

  NODE_ROWS="${NODE_ROWS}${pid}|node|${cwd}|${status}|${reason}"$'\n'
  if [ "$status" = "dangling" ]; then
    case " $NODE_DANGLING_PIDS " in
      *" $pid "*) ;;
      *) NODE_DANGLING_PIDS="${NODE_DANGLING_PIDS}${NODE_DANGLING_PIDS:+ }$pid" ;;
    esac
  fi
done

# --- POS ports snapshot -------------------------------------------------
PORT_ROWS=""
for port in 3742 6124; do
  line="$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1{printf "%s pid=%s\n",$1,$2; exit}' || true)"
  if [ -n "$line" ]; then
    PORT_ROWS="${PORT_ROWS}${port}|${line}"$'\n'
  else
    PORT_ROWS="${PORT_ROWS}${port}|free"$'\n'
  fi
done

# --- Orphan Bazel output bases ------------------------------------------
BAZEL_USER_ROOT="${OUTPUT_USER_ROOT:-/private/var/tmp/_bazel_${USER}}"
if [ ! -d "$BAZEL_USER_ROOT" ]; then
  BAZEL_USER_ROOT="${OUTPUT_USER_ROOT:-/tmp/_bazel_${USER}}"
fi

BASE_ROWS=""
ORPHAN_BASES=""

workspace_from_base() {
  _base="$1"
  if [ -f "$_base/DO_NOT_BUILD_HERE" ]; then
    tr -d '\n' <"$_base/DO_NOT_BUILD_HERE"
    return 0
  fi
  if [ -f "$_base/execroot/DO_NOT_BUILD_HERE" ]; then
    tr -d '\n' <"$_base/execroot/DO_NOT_BUILD_HERE"
    return 0
  fi
  return 1
}

if [ "$SWEEP_BASES" = true ] && [ -d "$BAZEL_USER_ROOT" ]; then
  for base in "$BAZEL_USER_ROOT"/*; do
    [ -d "$base" ] || continue
    bname="$(basename "$base")"
    [ "$bname" = "install" ] && continue
    [ "$bname" = "cache" ] && continue
    is_hex32 "$bname" || continue

    ws="$(workspace_from_base "$base" || true)"
    ws="${ws%/}"

    status="unknown"
    if [ -z "$ws" ]; then
      status="unknown"
    elif [ ! -d "$ws" ]; then
      status="orphan"
    elif is_known_worktree "$ws"; then
      status="active"
    else
      case "$ws" in
        *spicyhome*|*opencode/worktree*) status="orphan" ;;
        *) status="unknown" ;;
      esac
    fi

    BASE_ROWS="${BASE_ROWS}${base}|${ws}|${status}"$'\n'
    if [ "$status" = "orphan" ]; then
      ORPHAN_BASES="${ORPHAN_BASES}${ORPHAN_BASES:+ }$base"
    fi
  done
fi

count_words() {
  # shellcheck disable=SC2086
  set -- $1
  echo $#
}

bc="$(count_words "$DANGLING_PIDS")"
nc="$(count_words "$NODE_DANGLING_PIDS")"
oc="$(count_words "$ORPHAN_BASES")"
dangling_count=$((bc + nc))
if [ "$SWEEP_BASES" = true ]; then
  dangling_count=$((dangling_count + oc))
fi

# --- Report -------------------------------------------------------------
if [ "$JSON" = true ]; then
  json_bazel=""
  json_node=""
  json_bases=""
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    pid="${row%%|*}"
    rest="${row#*|}"
    name="${rest%%|*}"
    rest="${rest#*|}"
    ws="${rest%%|*}"
    status="${rest#*|}"
    piece="$(printf '{"pid":%s,"name":"%s","workspace":"%s","status":"%s"}' "$pid" "$name" "$ws" "$status")"
    if [ -z "$json_bazel" ]; then json_bazel="$piece"; else json_bazel="${json_bazel},${piece}"; fi
  done <<EOF
$(printf '%s' "$BAZEL_ROWS")
EOF
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    pid="${row%%|*}"
    rest="${row#*|}"
    rest="${rest#*|}"
    cwd="${rest%%|*}"
    rest="${rest#*|}"
    status="${rest%%|*}"
    reason="${rest#*|}"
    cwd_esc="$(printf '%s' "$cwd" | sed 's/"/\\"/g')"
    piece="$(printf '{"pid":%s,"cwd":"%s","status":"%s","reason":"%s"}' "$pid" "$cwd_esc" "$status" "$reason")"
    if [ -z "$json_node" ]; then json_node="$piece"; else json_node="${json_node},${piece}"; fi
  done <<EOF
$(printf '%s' "$NODE_ROWS")
EOF
  while IFS= read -r row; do
    [ -n "$row" ] || continue
    base="${row%%|*}"
    rest="${row#*|}"
    ws="${rest%%|*}"
    status="${rest#*|}"
    ws_esc="$(printf '%s' "$ws" | sed 's/"/\\"/g')"
    piece="$(printf '{"path":"%s","workspace":"%s","status":"%s"}' "$base" "$ws_esc" "$status")"
    if [ -z "$json_bases" ]; then json_bases="$piece"; else json_bases="${json_bases},${piece}"; fi
  done <<EOF
$(printf '%s' "$BASE_ROWS")
EOF
  printf '{"repo":"%s","bazel":[%s],"node":[%s],"output_bases":[%s],"dangling_count":%s,"orphan_bases":%s}\n' \
    "$REPO_ROOT" "$json_bazel" "$json_node" "$json_bases" "$dangling_count" "$oc"
else
  echo "Repo: $REPO_ROOT"
  echo
  echo "Registered worktrees:"
  if [ -z "$KNOWN_WT" ]; then
    echo "  (none found — is this a git checkout?)"
  else
    printf '%s\n' "$KNOWN_WT" | sort | sed 's/^/  - /'
  fi
  echo
  echo "Bazel servers:"
  if [ -z "$BAZEL_ROWS" ]; then
    echo "  (none)"
  else
    printf '%s' "$BAZEL_ROWS" | while IFS= read -r row; do
      [ -n "$row" ] || continue
      pid="${row%%|*}"
      rest="${row#*|}"
      name="${rest%%|*}"
      rest="${rest#*|}"
      ws="${rest%%|*}"
      status="${rest#*|}"
      printf '  [%s] pid=%s  %s\n         workspace=%s\n' "$status" "$pid" "$name" "${ws:-?}"
    done
  fi
  echo
  echo "SpicyHome-related Node:"
  if [ -z "$NODE_ROWS" ]; then
    echo "  (none)"
  else
    printf '%s' "$NODE_ROWS" | while IFS= read -r row; do
      [ -n "$row" ] || continue
      pid="${row%%|*}"
      rest="${row#*|}"
      rest="${rest#*|}"
      cwd="${rest%%|*}"
      rest="${rest#*|}"
      status="${rest%%|*}"
      reason="${rest#*|}"
      printf '  [%s] pid=%s  cwd=%s  (%s)\n' "$status" "$pid" "${cwd:-?}" "$reason"
    done
  fi
  echo
  echo "Default POS ports:"
  printf '%s' "$PORT_ROWS" | while IFS= read -r row; do
    [ -n "$row" ] || continue
    port="${row%%|*}"
    info="${row#*|}"
    printf '  %s  %s\n' "$port" "$info"
  done

  if [ "$SWEEP_BASES" = true ]; then
    echo
    echo "Bazel output bases ($BAZEL_USER_ROOT):"
    if [ -z "$BASE_ROWS" ]; then
      echo "  (none)"
    else
      printf '%s' "$BASE_ROWS" | while IFS= read -r row; do
        [ -n "$row" ] || continue
        base="${row%%|*}"
        rest="${row#*|}"
        ws="${rest%%|*}"
        status="${rest#*|}"
        printf '  [%s] %s\n         workspace=%s\n' "$status" "$(basename "$base")" "${ws:-?}"
      done
    fi
  fi

  echo
  if [ "$dangling_count" -eq 0 ]; then
    if [ "$SWEEP_BASES" = true ]; then
      echo "Verdict: clean — no dangling processes or orphan output bases."
    else
      echo "Verdict: clean — no dangling Bazel/Node processes."
    fi
  else
    echo "Verdict: $dangling_count dangling item(s) (procs=$((bc + nc)), orphan_bases=$oc)."
    if [ $((bc + nc)) -gt 0 ]; then
      echo "  PIDs: $DANGLING_PIDS $NODE_DANGLING_PIDS"
    fi
    if [ "$oc" -gt 0 ]; then
      echo "  Orphan bases: $oc (use --kill with --sweep-output-bases to delete)"
    fi
  fi
fi

# --- Kill procs ---------------------------------------------------------
if [ "$DO_KILL" = true ]; then
  kill_list=""
  for p in $DANGLING_PIDS $NODE_DANGLING_PIDS; do
    [ -n "$p" ] || continue
    case " $kill_list " in
      *" $p "*) ;;
      *) kill_list="${kill_list}${kill_list:+ }$p" ;;
    esac
  done
  if [ "$KILL_ALL_BAZEL" = true ]; then
    for p in $ACTIVE_BAZEL_PIDS; do
      [ -n "$p" ] || continue
      case " $kill_list " in
        *" $p "*) ;;
        *) kill_list="${kill_list}${kill_list:+ }$p" ;;
      esac
    done
  fi

  if [ -z "$kill_list" ]; then
    echo "No processes to kill."
  elif [ "$DRY_RUN" = true ]; then
    echo "[dry-run] would kill: $kill_list"
  else
    echo "Killing: $kill_list"
    # shellcheck disable=SC2086
    kill $kill_list 2>/dev/null || true
    sleep 1
    still=""
    for p in $kill_list; do
      if kill -0 "$p" 2>/dev/null; then
        still="${still}${still:+ }$p"
      fi
    done
    if [ -n "$still" ]; then
      echo "SIGKILL: $still"
      # shellcheck disable=SC2086
      kill -9 $still 2>/dev/null || true
      sleep 0.5
    fi

    failed=0
    for p in $kill_list; do
      if kill -0 "$p" 2>/dev/null; then
        echo "Failed to kill pid $p" >&2
        failed=1
      fi
    done
    if [ "$failed" -ne 0 ]; then
      exit 1
    fi
    echo "Done — all targeted processes gone."
  fi
fi

# --- Sweep orphan output bases ------------------------------------------
if [ "$SWEEP_BASES" = true ] && [ "$DO_KILL" = true ] && [ -n "$ORPHAN_BASES" ]; then
  echo "Sweeping orphan output base(s)..."
  sweep_failed=0
  for base in $ORPHAN_BASES; do
    case "$base" in
      "$BAZEL_USER_ROOT"/*) ;;
      *)
        echo "  refusing path outside bazel root: $base" >&2
        sweep_failed=1
        continue
        ;;
    esac
    bname="$(basename "$base")"
    if ! is_hex32 "$bname"; then
      echo "  refusing non-hash dir: $base" >&2
      sweep_failed=1
      continue
    fi
    echo "  rm -rf $base"
    if [ "$DRY_RUN" = true ]; then
      continue
    fi
    chmod -R u+w "$base" 2>/dev/null || true
    if ! rm -rf "$base" 2>/dev/null; then
      chmod -R a+w "$base" 2>/dev/null || true
      if ! rm -rf "$base"; then
        echo "  error: could not delete $base — try: sudo rm -rf '$base'" >&2
        sweep_failed=1
      fi
    fi
  done
  if [ "$sweep_failed" -ne 0 ]; then
    exit 1
  fi
  echo "Done — orphan output bases removed."
elif [ "$SWEEP_BASES" = true ] && [ "$DO_KILL" != true ] && [ -n "$ORPHAN_BASES" ]; then
  echo
  echo "Orphan bases listed above were NOT deleted (report only)."
  echo "Re-run with: cleanup-dangling.sh --sweep-output-bases --kill"
fi

if [ "$DO_KILL" = true ]; then
  exit 0
fi

if [ "$dangling_count" -gt 0 ]; then
  exit 1
fi
exit 0
