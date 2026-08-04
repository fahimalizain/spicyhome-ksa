# Delete worktree / clean orphans

**Linked worktrees only** for full delete. Refuses main (directory `.git`).

## Delete one live worktree

```bash
bash .agents/skills/worktree/scripts/delete.sh /path/to/wt
bash .agents/skills/worktree/scripts/delete.sh .                 # cwd = linked wt
bash .agents/skills/worktree/scripts/delete.sh /path/to/wt --force
bash .agents/skills/worktree/scripts/delete.sh /path/to/wt --delete-branch
bash .agents/skills/worktree/scripts/delete.sh /path/to/wt --keep-db
bash .agents/skills/worktree/scripts/delete.sh /path/to/wt --dry-run
```

### Order (`delete.sh`)

1. Refuse main; require registered linked worktree
2. Kill Bazel (`--workspace_directory=<wt>`) + Node/Java under that cwd
3. `bazel clean --expunge`
4. Sweep output base whose `DO_NOT_BUILD_HERE` equals the path
5. Remove worktree-local `SPICYHOME_DB` (+ wal/shm) if inside the wt
6. `git worktree remove` (`--force` if dirty)
7. Optional `--delete-branch`

Does **not** touch shared Bazel `install/` / `cache/`, other worktrees, or
main `data/spicyhome.db`.

### Agent workflow

1. Resolve path (`git worktree list`). Never target main.
2. Ambiguous “old ones” → list and confirm; no mass-delete without explicit
   paths or “all linked except …”.
3. `--dry-run` when unsure; then delete.
4. Cwd **outside** the worktree being removed.
5. Report path removed + branch action.

---

## Cleanup leftovers (deleted without `delete.sh`)

Hand/manager remove leaves Bazel JVMs, Node/Vite, and **output bases**
(~1.5G each under `/private/var/tmp/_bazel_$USER/`).

```bash
bash .agents/skills/worktree/scripts/cleanup-dangling.sh
bash .agents/skills/worktree/scripts/cleanup-dangling.sh --kill
bash .agents/skills/worktree/scripts/cleanup-dangling.sh --kill-all-bazel
bash .agents/skills/worktree/scripts/cleanup-dangling.sh --sweep-output-bases
bash .agents/skills/worktree/scripts/cleanup-dangling.sh --sweep-output-bases --kill
bash .agents/skills/worktree/scripts/cleanup-dangling.sh --json
bash .agents/skills/worktree/scripts/cleanup-dangling.sh --sweep-output-bases --kill --dry-run
```

### Classification

| Status                    | Meaning                                                 |
| ------------------------- | ------------------------------------------------------- |
| **active**                | Registered `git worktree` for this repo                 |
| **dangling** / **orphan** | Path missing, or spicyhome/opencode path not registered |
| **unknown**               | Unrelated — leave alone                                 |

**Never kill by default:** VS Code/Cursor helpers, tsserver, unrelated Node,
active worktree Bazel (unless `--kill-all-bazel`).

### Agent workflow (orphans)

1. Report first (add `--sweep-output-bases` if disk is the issue).
2. Summarize worktrees, Bazel/Node, orphan base count.
3. `--kill` when user wants cleanup; add `--sweep-output-bases` for disk.
4. No `--kill-all-bazel` unless they want every SpicyHome Bazel server stopped.
5. Re-run report to confirm clean.

### Output bases

macOS: `/private/var/tmp/_bazel_$USER/<32-hex>/`.  
`DO_NOT_BUILD_HERE` holds the absolute workspace path.  
Only wipe the **entire** `_bazel_$USER` tree if the user explicitly wants
every workspace cache gone.

## Do not

- Delete the main worktree
- Skip expunge/sweep on delete (disk leak)
- Kill active servers or mass-rm bases without explicit ask
- Print secrets from `.env.worktree`
