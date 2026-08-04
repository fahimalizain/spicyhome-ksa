---
name: worktree
description: SpicyHome git worktree lifecycle — bootstrap linked checkouts (ports, DB, pnpm, Sentry), delete worktrees (procs, Bazel output base ~1.5G, DB, git remove), and clean orphan Bazel/Node leftovers. Use when bootstrap/setup worktree, .env.worktree, port conflicts, delete/remove worktree, dangling/orphan bazel, cleanup-dangling, expunge, or free disk from old worktrees. Does not create worktrees.
---

# Worktree

**Creation is external** (user’s worktree manager). This skill only
**bootstraps** existing checkouts or **tears them down** / cleans orphans.

## Route

| Intent                                                       | Load                                               |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Setup / ports / DB / `pnpm install` / Sentry / VS Code debug | [references/bootstrap.md](references/bootstrap.md) |
| Delete a linked worktree, or orphan procs / output bases     | [references/delete.md](references/delete.md)       |

Load **one** reference per task. Do not invent steps not in that reference.

## Scripts

All under `scripts/` (repo path `.agents/skills/worktree/scripts/`):

| Script                                     | Used by          |
| ------------------------------------------ | ---------------- |
| `bootstrap.sh`, `env.sh`, `with-node24.sh` | bootstrap        |
| `delete.sh`, `cleanup-dangling.sh`         | delete / orphans |

```bash
bash .agents/skills/worktree/scripts/<name>.sh …
```

## Invariants

- Never `git worktree add` / choose checkout paths for the user
- Never delete the **main** worktree (directory `.git`)
- Linked only: isolated `.env.worktree` (ports + `SPICYHOME_DB`); do not
  commit it or real DSNs
- Each worktree owns a Bazel **output base** (~1.5G under
  `/private/var/tmp/_bazel_$USER/`). Delete must expunge/sweep it; bare
  `git worktree remove` leaks disk
- Shared Bazel `install/` and `cache/` are never wiped by these scripts
