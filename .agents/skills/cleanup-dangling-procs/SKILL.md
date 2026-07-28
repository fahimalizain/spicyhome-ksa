---
name: cleanup-dangling-procs
description: Find and kill dangling Bazel/Java and SpicyHome Node/Vite processes left behind by removed git worktrees. Use when the user asks about dangling/orphan/zombie processes, leftover bazel or java servers, stale node/vite after worktree cleanup, worktree process cleanup, or mentions cleanup-dangling-procs.
---

# Cleanup Dangling Processes

Worktrees each get their own **Bazel server** (JVM). Removing a worktree does
**not** stop that server. This skill reports what is still running and kills
only the orphans.

## Script (preferred)

```bash
# Report only (exit 1 if anything dangling)
bash scripts/worktree/cleanup-dangling.sh

# Kill dangling Bazel + SpicyHome Node only
bash scripts/worktree/cleanup-dangling.sh --kill

# Also stop Bazel servers for still-registered worktrees
bash scripts/worktree/cleanup-dangling.sh --kill-all-bazel
```

Run from any SpicyHome checkout; the script resolves the main repo via its
path under `scripts/worktree/`.

## Classification

| Status       | Meaning                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **active**   | Workspace path is a registered `git worktree` for this repo                                       |
| **dangling** | Workspace dir missing, or path looks like a SpicyHome/opencode worktree but is **not** registered |
| **unknown**  | Bazel/Java unrelated to this repo — leave alone                                                   |

**Never kill by default:**

- VS Code / Cursor helpers, tsserver, ESLint language servers
- Unrelated Node (Discord, agent-browser, openchamber, etc.)
- Active worktree Bazel servers (unless `--kill-all-bazel`)

## Agent workflow

### 1. Report

```bash
bash scripts/worktree/cleanup-dangling.sh
```

Summarize for the user:

- Registered worktrees
- Each Bazel server: pid, name, workspace, status
- SpicyHome-related Node (vite/tsx/server) with cwd + status
- Default POS ports `3742` / `6124` (worktree offsets may differ)

### 2. Kill only when asked

If the user wants cleanup:

```bash
bash scripts/worktree/cleanup-dangling.sh --kill
```

Do **not** pass `--kill-all-bazel` unless they explicitly want every SpicyHome
Bazel server stopped (including main + live worktrees).

### 3. Re-check

```bash
bash scripts/worktree/cleanup-dangling.sh
```

Confirm verdict is clean (or only expected **active** servers remain).

## Manual fallback

If the script is unavailable, approximate:

```bash
# Bazel servers (look for --workspace_directory=...)
pgrep -lf 'A-server.jar'

# Registered worktrees
git worktree list

# Kill a specific orphan pid
kill <pid> && sleep 1 && kill -9 <pid> 2>/dev/null
```

A server is dangling when its `--workspace_directory` is missing on disk or
absent from `git worktree list`.

## Optional disk cleanup

Orphan **output bases** under `/private/var/tmp/_bazel_$USER/` are not
processes. Only wipe them if the user wants disk back — this drops caches for
**all** workspaces:

```bash
# Destructive — ask first
rm -rf "/private/var/tmp/_bazel_${USER}"
```

Prefer killing JVMs first; leave disk cleanup as a separate, confirmed step.

## Do not

- Kill active worktree or main-repo Bazel servers without explicit ask
- Treat IDE Node helpers as SpicyHome leftovers
- Run `git worktree remove` / delete checkouts from this skill
- Confuse this with `bootstrap-worktree` (env/ports setup, not process cleanup)
