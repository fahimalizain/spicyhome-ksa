# Bootstrap worktree

Prepare an **already-created** checkout: `.env.worktree` + deps.

Both main and linked worktrees use `.env.worktree` — never a separate root `.env`.

Linked worktrees **inherit Sentry DSNs** from the main worktree’s
`.env.worktree`. Bootstrap also syncs `apps/android/local.properties` from
`SENTRY_ANDROID_DSN` (never server `SENTRY_DSN`).

## Defaults

|                   | Main (directory `.git`) | Linked worktree            |
| ----------------- | ----------------------- | -------------------------- |
| `PORT` (API)      | `3742`                  | `3742 + offset`            |
| `VITE_PORT` (POS) | `6124`                  | `6124 + offset`            |
| `INSPECT_PORT`    | `9229`                  | `9229 + offset`            |
| DB                | `data/spicyhome.db`     | `data/spicyhome-<slug>.db` |

`offset` = `hash(realpath) % 999 + 1` — stable, never collides with main.

## Host Node

- Host tooling: **Node 24** (`.nvmrc`)
- Server runtime target stays Node 18 (Bazel / Win7) — separate concern
- Prefer `nvm use` before bootstrap (Node 18/26+ break install in different ways)

## Sentry

- Env tags default to `development` for all local worktrees (not the slug)
- If `SENTRY_ANDROID_DSN` missing on main, Android builds have no Sentry
- `android-adb-install` should bootstrap first so `local.properties` is current

## Scripts

```bash
bash .agents/skills/worktree/scripts/bootstrap.sh
bash .agents/skills/worktree/scripts/bootstrap.sh /path/to/wt
bash .agents/skills/worktree/scripts/bootstrap.sh --force-env
bash .agents/skills/worktree/scripts/bootstrap.sh --skip-install
bash .agents/skills/worktree/scripts/env.sh --print
```

## Agent workflow

1. Confirm checkout exists (cwd or path). No checkout → user creates it first;
   do **not** `git worktree add`.
2. Run `bootstrap.sh` (`--force-env` only if ports/DB must regenerate).
3. Fix Node PATH if needed (`nvm use`); re-run.
4. Report API / POS URLs and DB path from `.env.worktree`.
5. Debug: open **that** folder as workspace → **Debug Server + POS**.
   Launch uses `with-node24.sh`; preLaunch ensures env via `env.sh`.

CLI without debugger:

```bash
set -a && source .env.worktree && set +a
pnpm --filter @spicyhome/pos dev
```

## Do not

- `git worktree add` or invent sibling paths
- Hardcode ports — read `PORT` / `VITE_PORT`
- Commit `.env.worktree`, `local.properties`, or real DSNs/tokens
- Share one SQLite file across linked worktrees for write tests
- Put server `SENTRY_DSN` into Android `local.properties`

## Related repo pieces

- `apps/pos/vite.config.ts` — `VITE_PORT`, proxy → `PORT`
- `.vscode/launch.json` / `tasks.json` — debug + ensure env
