#!/usr/bin/env bash
# Find (and optionally kill) dangling Bazel/Java/Node processes left by
# SpicyHome worktrees after the checkouts were removed.
#
# Usage:
#   scripts/worktree/cleanup-dangling.sh              # report only
#   scripts/worktree/cleanup-dangling.sh --kill       # kill dangling only
#   scripts/worktree/cleanup-dangling.sh --kill-all-bazel  # also stop active worktree servers
#   scripts/worktree/cleanup-dangling.sh --json       # machine-readable report
#
# Exit codes:
#   0  nothing dangling (or kill succeeded)
#   1  dangling found (report mode) / kill failed
#   2  usage / environment error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DO_KILL=false
KILL_ALL_BAZEL=false
JSON=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --kill) DO_KILL=true; shift ;;
    --kill-all-bazel) DO_KILL=true; KILL_ALL_BAZEL=true; shift ;;
    --json) JSON=true; shift ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Error: unexpected argument: $1" >&2
      exit 2
      ;;
  esac
done

# --- Discover registered git worktrees (absolute paths) -----------------
declare -A KNOWN_WT=()
while IFS= read -r line; do
  # format: /abs/path  <sha> [branch]
  path="${line%% *}"
  [[ -n "$path" ]] || continue
  # normalize trailing slash
  path="${path%/}"
  KNOWN_WT["$path"]=1
done < <(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print substr($0,10)}')

is_known_worktree() {
  local p="${1%/}"
  [[ -n "${KNOWN_WT[$p]+x}" ]]
}

# --- Collect Bazel servers ----------------------------------------------
# Each entry: pid|workspace|status  status=active|dangling|unknown
BAZEL_ROWS=()
DANGLING_PIDS=()
ACTIVE_BAZEL_PIDS=()

while IFS= read -r pid; do
  [[ -n "$pid" ]] || continue
  # cmdline may be long; prefer /proc on linux, ps on macOS
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ -n "$cmd" ]] || continue

  ws=""
  ws="$(printf '%s\n' "$cmd" | sed -n 's/.*--workspace_directory=\([^[:space:]]*\).*/\1/p' | head -1)"
  ws="${ws%/}"

  status="unknown"
  if [[ -z "$ws" ]]; then
    status="unknown"
  elif [[ ! -d "$ws" ]]; then
    status="dangling"
  elif is_known_worktree "$ws"; then
    status="active"
  else
    # Directory exists but not a registered worktree of this repo
    # Only flag as dangling if it looks like a spicyhome / opencode worktree path
    case "$ws" in
      *spicyhome*|*opencode/worktree*) status="dangling" ;;
      *) status="unknown" ;;
    esac
  fi

  name="bazel"
  bname="$(printf '%s\n' "$cmd" | sed -n 's/.*bazel(\([^)]*\)).*/\1/p' | head -1)"
  if [[ -n "$bname" ]]; then
    name="bazel($bname)"
  fi

  BAZEL_ROWS+=("$pid|$name|$ws|$status")
  if [[ "$status" == "dangling" ]]; then
    DANGLING_PIDS+=("$pid")
  elif [[ "$status" == "active" ]]; then
    ACTIVE_BAZEL_PIDS+=("$pid")
  fi
done < <(pgrep -f 'A-server\.jar|--product_name=Bazel' 2>/dev/null || true)

# Deduplicate pids (pgrep can match parent+child patterns)
dedupe_array() {
  local -n arr=$1
  local -A seen=()
  local out=()
  local x
  for x in "${arr[@]}"; do
    [[ -n "${seen[$x]+x}" ]] && continue
    seen[$x]=1
    out+=("$x")
  done
  arr=("${out[@]+"${out[@]}"}")
}
dedupe_array DANGLING_PIDS
dedupe_array ACTIVE_BAZEL_PIDS

# --- Collect SpicyHome-related Node processes ---------------------------
# Match cmdline path hints; exclude VS Code / Electron helpers / opencode IDE
NODE_ROWS=()
NODE_DANGLING_PIDS=()

is_ide_noise() {
  local c="$1"
  case "$c" in
    *Visual\ Studio\ Code*|*Code\ Helper*|*Cursor.app*|*Electron*|*opencode*|*openchamber*|*agent-browser*|*Discord*) return 0 ;;
  esac
  return 1
}

while IFS= read -r pid; do
  [[ -n "$pid" ]] || continue
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ -n "$cmd" ]] || continue
  is_ide_noise "$cmd" && continue

  # cwd when available (macOS: lsof)
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
      reason="${reason:+$reason+}cwd"
      ;;
  esac

  # vite/tsx/nest only if cwd is under a known spicyhome tree
  if [[ "$related" == false ]]; then
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

  [[ "$related" == true ]] || continue

  status="active"
  # If cwd is set and is not a known worktree / does not exist → dangling
  if [[ -n "$cwd" ]]; then
    if [[ ! -d "$cwd" ]]; then
      status="dangling"
    elif ! is_known_worktree "$cwd"; then
      # walk up to find worktree root match
      probe="$cwd"
      matched=false
      while [[ -n "$probe" && "$probe" != "/" ]]; do
        if is_known_worktree "$probe"; then
          matched=true
          break
        fi
        probe="$(dirname "$probe")"
      done
      if [[ "$matched" == false ]]; then
        case "$cwd" in
          *opencode/worktree*|*spicyhome*) status="dangling" ;;
        esac
      fi
    fi
  fi

  NODE_ROWS+=("$pid|node|$cwd|$status|$reason")
  if [[ "$status" == "dangling" ]]; then
    NODE_DANGLING_PIDS+=("$pid")
  fi
done < <(pgrep -f 'node|vite|tsx|ts-node' 2>/dev/null || true)

dedupe_array NODE_DANGLING_PIDS

# --- POS ports snapshot -------------------------------------------------
PORT_ROWS=()
for port in 3742 6124; do
  line="$(lsof -iTCP:"$port" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1{printf "%s pid=%s\n",$1,$2; exit}' || true)"
  if [[ -n "$line" ]]; then
    PORT_ROWS+=("$port|$line")
  else
    PORT_ROWS+=("$port|free")
  fi
done

# --- Report -------------------------------------------------------------
bc=${#DANGLING_PIDS[@]}
nc=${#NODE_DANGLING_PIDS[@]}
dangling_count=$((bc + nc))

if [[ "$JSON" == true ]]; then
  # minimal JSON without jq dependency
  echo -n '{"repo":"'"$REPO_ROOT"'","bazel":['
  first=1
  for row in "${BAZEL_ROWS[@]}"; do
    IFS='|' read -r pid name ws status <<<"$row"
    [[ $first -eq 1 ]] || echo -n ','
    first=0
    printf '{"pid":%s,"name":"%s","workspace":"%s","status":"%s"}' "$pid" "$name" "$ws" "$status"
  done
  echo -n '],"node":['
  first=1
  for row in "${NODE_ROWS[@]}"; do
    IFS='|' read -r pid name cwd status reason <<<"$row"
    [[ $first -eq 1 ]] || echo -n ','
    first=0
    printf '{"pid":%s,"cwd":"%s","status":"%s","reason":"%s"}' "$pid" "${cwd//\"/\\\"}" "$status" "$reason"
  done
  echo -n '],"dangling_count":'"$dangling_count"'}'
  echo
else
  echo "Repo: $REPO_ROOT"
  echo
  echo "Registered worktrees:"
  if [[ ${#KNOWN_WT[@]} -eq 0 ]]; then
    echo "  (none found — is this a git checkout?)"
  else
    for p in "${!KNOWN_WT[@]}"; do
      echo "  - $p"
    done | sort
  fi
  echo
  echo "Bazel servers:"
  if [[ ${#BAZEL_ROWS[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    for row in "${BAZEL_ROWS[@]}"; do
      IFS='|' read -r pid name ws status <<<"$row"
      printf '  [%s] pid=%s  %s\n         workspace=%s\n' "$status" "$pid" "$name" "${ws:-?}"
    done
  fi
  echo
  echo "SpicyHome-related Node:"
  if [[ ${#NODE_ROWS[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    for row in "${NODE_ROWS[@]}"; do
      IFS='|' read -r pid name cwd status reason <<<"$row"
      printf '  [%s] pid=%s  cwd=%s  (%s)\n' "$status" "$pid" "${cwd:-?}" "$reason"
    done
  fi
  echo
  echo "Default POS ports:"
  for row in "${PORT_ROWS[@]}"; do
    IFS='|' read -r port info <<<"$row"
    printf '  %s  %s\n' "$port" "$info"
  done
  echo
  if [[ "$dangling_count" -eq 0 ]]; then
    echo "Verdict: clean — no dangling Bazel/Node processes."
  else
    echo "Verdict: $dangling_count dangling process(es)."
    echo -n "  PIDs:"
    for p in "${DANGLING_PIDS[@]}" "${NODE_DANGLING_PIDS[@]}"; do
      echo -n " $p"
    done
    echo
  fi
fi

# --- Kill ---------------------------------------------------------------
if [[ "$DO_KILL" == true ]]; then
  targets=()
  for p in "${DANGLING_PIDS[@]}"; do targets+=("$p"); done
  for p in "${NODE_DANGLING_PIDS[@]}"; do targets+=("$p"); done
  if [[ "$KILL_ALL_BAZEL" == true ]]; then
    for p in "${ACTIVE_BAZEL_PIDS[@]}"; do targets+=("$p"); done
  fi

  # dedupe targets
  declare -A tseen=()
  kill_list=()
  for p in "${targets[@]}"; do
    [[ -n "${tseen[$p]+x}" ]] && continue
    tseen[$p]=1
    kill_list+=("$p")
  done

  if [[ ${#kill_list[@]} -eq 0 ]]; then
    echo "Nothing to kill."
    exit 0
  fi

  echo "Killing: ${kill_list[*]}"
  kill "${kill_list[@]}" 2>/dev/null || true
  sleep 1
  # force stubborn JVMs
  still=()
  for p in "${kill_list[@]}"; do
    if kill -0 "$p" 2>/dev/null; then
      still+=("$p")
    fi
  done
  if [[ ${#still[@]} -gt 0 ]]; then
    echo "SIGKILL: ${still[*]}"
    kill -9 "${still[@]}" 2>/dev/null || true
    sleep 0.5
  fi

  failed=0
  for p in "${kill_list[@]}"; do
    if kill -0 "$p" 2>/dev/null; then
      echo "Failed to kill pid $p" >&2
      failed=1
    fi
  done
  if [[ "$failed" -eq 0 ]]; then
    echo "Done — all targeted processes gone."
    exit 0
  fi
  exit 1
fi

# report-only exit code
if [[ "$dangling_count" -gt 0 ]]; then
  exit 1
fi
exit 0
