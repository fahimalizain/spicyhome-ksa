---
name: setup-worktree
description: Create or refresh a git worktree with isolated ports, SQLite DB, and VS Code debug configs for parallel Server+POS work. Use when the user wants a worktree, parallel checkout, branch sandbox, isolated debug ports, or mentions setup-worktree, worktree env, port conflicts between worktrees.
---

# Setup Worktree

Parallel worktrees need **isolated ports + DB**, not just a second git checkout. This repo wires that via `.env.worktree` (gitignored).

## Defaults

|                   | Main worktree (`.git` dir) | Linked worktree            |
| ----------------- | -------------------------- | -------------------------- |
| `PORT` (API)      | `3742`                     | `3742 + offset`            |
| `VITE_PORT` (POS) | `6124`                     | `6124 + offset`            |
| `INSPECT_PORT`    | `9229`                     | `9229 + (offset % 100)`    |
| DB                | `data/spicyhome.db`        | `data/spicyhome-<slug>.db` |

`offset` = `hash(realpath) % 999 + 1` — stable across restarts, never collides with main.

## Scripts

```bash
# New worktree + env + pnpm install
bash scripts/setup-worktree.sh <branch> [path]

# Only (re)write .env.worktree in current or given checkout
bash scripts/setup-worktree.sh --env-only
bash scripts/setup-worktree.sh --env-only --force-env /path/to/wt

# Print allocation without writing
bash scripts/worktree-env.sh --print
```

## Agent workflow

### 1. Create or target a worktree

If the user names a branch and wants a fresh sandbox:

```bash
bash scripts/setup-worktree.sh <branch>
```

Default path: sibling `../<repo>-<branch-slug>`.

If they already have a path open, only ensure env:

```bash
bash scripts/setup-worktree.sh --env-only
```

### 2. Confirm ports

Read or print `.env.worktree`. Tell the user:

- API: `http://localhost:$PORT`
- POS: `http://localhost:$VITE_PORT`
- DB path

### 3. Debug in VS Code / Cursor

Open **that worktree folder** as the workspace root (not the main repo).

Run and Debug:

| Config                       | Purpose                                         |
| ---------------------------- | ----------------------------------------------- |
| **Debug Server + POS**       | Compound — Nest (ts-node) + Vite                |
| **Debug Server (ts-node)**   | API only (`envFile` → `.env.worktree`)          |
| **Debug POS (Vite)**         | SPA only; opens browser via `serverReadyAction` |
| **Attach to Server (Bazel)** | Main/machine-specific; not worktree-aware       |

First server launch runs task **Compile shared & db packages for ts-node**.

If `.env.worktree` is missing, launch falls back to hardcoded `3742`/`6124`/`data/spicyhome.db`. Prefer running `--env-only` once so the file exists (VS Code warns if `envFile` path is absent on some versions — create it).

### 4. CLI without debugger

```bash
set -a && source .env.worktree && set +a
# terminal 1
(cd apps/server && TZ=Asia/Riyadh npx ts-node/register …)  # or use VS Code
# terminal 2
pnpm --filter @spicyhome/pos dev
```

Vite reads `.env.worktree` from the repo root automatically (`apps/pos/vite.config.ts`).

## Do not

- Hardcode ports in new launch configs — read `PORT` / `VITE_PORT`.
- Commit `.env.worktree`.
- Share one SQLite file across linked worktrees when testing writes.
- Assume Bazel attach `remoteRoot` works outside the machine that generated it.

## Repo pieces

- `scripts/worktree-env.sh` — allocator + writer
- `scripts/setup-worktree.sh` — `git worktree add` + env + `pnpm install`
- `apps/pos/vite.config.ts` — `VITE_PORT`, proxy → `PORT`
- `.vscode/launch.json` — Server, POS, compound
- `.vscode/tasks.json` — compile + ensure/print env
