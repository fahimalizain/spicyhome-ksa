---
name: bootstrap-worktree
description: Bootstrap an already-created git worktree with isolated ports, SQLite DB, and deps for parallel Server+POS work. Use when the user opens a linked worktree, asks to bootstrap/setup the worktree env, fix port conflicts, or mentions bootstrap-worktree, worktree env, .env.worktree. Does not create worktrees.
---

# Bootstrap Worktree

**You do not create git worktrees.** The user’s worktree manager owns
`git worktree add` / path layout. This skill only prepares a checkout that
already exists on disk.

Parallel checkouts need **isolated ports + DB** via `.env.worktree` (gitignored),
plus `pnpm install` on a cold tree.

Both main and linked worktrees use `.env.worktree` — never a separate root `.env`.

**Linked worktrees inherit Sentry DSNs from the main worktree's `.env.worktree`**
automatically.  The bootstrap also syncs `apps/android/local.properties` from
`SENTRY_ANDROID_DSN` so Android builds get the correct Sentry configuration.

## Defaults

|                   | Main worktree (directory `.git`) | Linked worktree            |
| ----------------- | -------------------------------- | -------------------------- |
| `PORT` (API)      | `3742`                           | `3742 + offset`            |
| `VITE_PORT` (POS) | `6124`                           | `6124 + offset`            |
| `INSPECT_PORT`    | `9229`                           | `9229 + offset`            |
| DB                | `data/spicyhome.db`              | `data/spicyhome-<slug>.db` |

`offset` = `hash(realpath) % 999 + 1` — stable across restarts, never collides with main.

## Host Node

- **Host tooling: Node 24** (`.nvmrc`, `pnpm ensure-node24`).
- Server _runtime_ target remains Node 18 (Bazel / Win7); that is separate from
  host `pnpm install` / local debug.
- Node 18 often fails modern package `engines`; Node 26+ often fails
  `better-sqlite3` native builds. Prefer `nvm use` so PATH is Node 24 before
  bootstrap.

## Sentry Inheritance

Linked worktrees automatically inherit Sentry DSN keys from the main worktree's
`.env.worktree`.  Environment tags (`SENTRY_ENVIRONMENT`, `VITE_SENTRY_ENVIRONMENT`)
are set to the **worktree slug** so each branch reports as a separate environment
in Sentry.

### Android

`SENTRY_ANDROID_DSN` from `.env.worktree` is synced into
`apps/android/local.properties` (gitignored) as `SENTRY_DSN`.  The server
`SENTRY_DSN` is never written into the Android build config.

If `SENTRY_ANDROID_DSN` is not set in the main worktree, Android builds will
not have Sentry configured.  Set it in main's `.env.worktree` first.

Agents running `android-adb-install` should bootstrap first to ensure
`local.properties` is in sync.

## Scripts

```bash
# Full bootstrap (env + pnpm install) — default agent path
bash scripts/worktree/bootstrap.sh

# Explicit checkout path
bash scripts/worktree/bootstrap.sh /path/to/wt

# Rewrite .env.worktree even if it exists
bash scripts/worktree/bootstrap.sh --force-env

# Env only (no install)
bash scripts/worktree/bootstrap.sh --skip-install
bash scripts/worktree/env.sh --print
```

## Agent workflow

### 1. Confirm checkout exists

Working directory should already be the worktree root (or pass its path).
If there is no git checkout, stop and tell the user to create the worktree
with their manager first — do **not** run `git worktree add`.

### 2. Bootstrap

```bash
bash scripts/worktree/bootstrap.sh
```

Use `--force-env` only when ports/DB allocation must be regenerated.

If Node is wrong, fix PATH (`nvm use`) and re-run; do not invent alternate
install paths unless the user asks.

### 3. Confirm allocation

Read `.env.worktree` or the script summary. Tell the user:

- API: `http://localhost:$PORT`
- POS: `http://localhost:$VITE_PORT`
- DB path

### 4. Debug in VS Code / Cursor

Open **that worktree folder** as the workspace root (not the main repo).

| Config                       | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| **Debug Server + POS**       | Compound — Nest (ts-node) + Vite                |
| **Debug Server (ts-node)**   | API only (`envFile` → `.env.worktree`)          |
| **Debug POS (Vite)**         | SPA only; opens browser via `serverReadyAction` |
| **Attach to Server (Bazel)** | Main/machine-specific; not worktree-aware       |

First server launch runs task **Compile shared & db packages for ts-node**
(which also ensures `.env.worktree` via `scripts/worktree/env.sh`).

Launch configs run via `scripts/worktree/with-node24.sh` so VS Code does not
pick GUI PATH Homebrew Node 26+ (ABI mismatch with `better-sqlite3`).

### 5. CLI without debugger

```bash
set -a && source .env.worktree && set +a
pnpm --filter @spicyhome/pos dev
```

Vite reads `.env.worktree` from the repo root (`apps/pos/vite.config.ts`).

## Do not

- Run `git worktree add` or choose sibling checkout paths.
- Hardcode ports in launch configs — read `PORT` / `VITE_PORT`.
- Commit `.env.worktree`, `local.properties`, or any real DSNs/tokens.
- Share one SQLite file across linked worktrees when testing writes.
- Assume Bazel attach `remoteRoot` works outside the machine that generated it.
- Put server `SENTRY_DSN` into Android `local.properties` — use `SENTRY_ANDROID_DSN`.

## Repo pieces

- `scripts/worktree/bootstrap.sh` — env + Node 24 check + `pnpm install`
- `scripts/worktree/env.sh` — port/DB allocator + `.env.worktree` writer
- `scripts/worktree/with-node24.sh` — force Node 24 on PATH for VS Code debug
- `apps/pos/vite.config.ts` — `VITE_PORT`, proxy → `PORT`
- `.vscode/launch.json` — Server, POS, compound (via `with-node24.sh`)
- `.vscode/tasks.json` — compile + ensure/print env
