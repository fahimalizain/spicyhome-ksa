---
name: db-migrate
description: Schema and migration workflow for the SpicyHome POS SQLite database. Use when editing schema.ts, adding/removing columns, tables, indexes, triggers, backfills, or running migrations. Also use when working with drizzle-kit, drizzle-orm migrations, or any database schema change.
---

# DB Migrate — SpicyHome POS

Schema source of truth is `packages/db/src/schema.ts`. All DDL changes start there.
Migrations use [Drizzle journaled migrations](https://orm.drizzle.team/docs/migrations) via
`drizzle-orm/better-sqlite3/migrator` (runtime, Node 18 compatible) and
`drizzle-kit generate` (dev host, Node 24 per `.nvmrc`).

## When to load this skill

- Editing `packages/db/src/schema.ts`
- Adding/removing columns, tables, indexes, triggers, or backfills
- Mentioning "migration", "drizzle-kit", "db:generate", or "db:migrate"
- Any database schema change

## Operational flow

```
1. Edit packages/db/src/schema.ts
2. pnpm --filter @spicyhome/db -- db:generate --name <snake_case_reason>
   - For triggers / backfills (custom SQL only):
     pnpm --filter @spicyhome/db -- db:generate --custom --name <snake_case>
   - Fill custom SQL body if using --custom
3. If local DB file exists: pnpm --filter @spicyhome/db -- db:migrate
   (reads SPICYHOME_DB from env / .env.worktree)
4. Run relevant tests (packages/db + server as needed)
5. Commit schema.ts + packages/db/drizzle/** (sql + meta/) together
```

## Important rules

### Source of truth
- **schema.ts only.** Never hand-edit DDL in a kit-generated `*.sql`.
- Exception: `--custom` migration body is filled by hand (triggers, backfills, data fixes).
- Always pass `--name snake_case` on `db:generate`.

### Git artifacts
- **Commit SQL + `meta/`** (`_journal.json` + snapshots). Never gitignore `meta/`.
- Schema change + generated migration + meta must be in the **same commit**.

### Migration application
- Single apply path: `applyMigrations()` in `packages/db/src/migrate.ts` using
  `migrate()` from `drizzle-orm/better-sqlite3/migrator`.
- Called from:
  - **Server boot** (`DatabaseModule.onModuleInit`) — crash on failure, no silent skip
  - **CLI** `db:migrate` — same function
- Second run is a no-op (journaled).

### Incompatible old DB
- Do **NOT** auto-delete DB files. If migrate fails with an old/incompatible DB:
  - Human deletes `data/spicyhome*.db` manually
  - Restart server or re-run `db:migrate`
- Agents must never `rm` a production DB file.

### Seed after migrate
- `seed()` runs after migrate when users table is empty (dev/demo baseline).
- Payment methods, roles, admin user, tables, categories, items — all in `seed()`.
- **No** data INSERTs in migration SQL.

## Commands

```bash
# Generate a migration from schema.ts changes
pnpm --filter @spicyhome/db -- db:generate --name <snake_case_description>

# Generate a custom (empty) migration for triggers / backfills
pnpm --filter @spicyhome/db -- db:generate --custom --name <snake_case>

# Apply pending migrations (reads SPICYHOME_DB or defaults to ./data/spicyhome.db)
pnpm --filter @spicyhome/db -- db:migrate

# Run db package tests
pnpm --filter @spicyhome/db test

# Run all tests (Bazel)
pnpm test
```

### .env.worktree

For linked worktrees, `SPICYHOME_DB` is set in `.env.worktree` (gitignored).
The `db:migrate` CLI reads `SPICYHOME_DB` from the environment — source it first:

```bash
set -a && source .env.worktree && set +a
pnpm --filter @spicyhome/db -- db:migrate
```

## DB path resolution

1. `SPICYHOME_DB` env var if set (worktree `.env.worktree`)
2. Default: `./data/spicyhome.db` relative to cwd (or `BUILD_WORKSPACE_DIRECTORY` when under Bazel)
3. Parent directory is auto-created if missing

## Hard bans

- No hand-edit of kit-generated `*.sql` (except `--custom` body)
- No `schema.ts` change without generate + commit of `drizzle/` (sql + meta) in same changeset
- No swallow/warn-and-skip on migrate failure (server must crash)
- No `drizzle-kit push` as a workflow
- No seed data in migration SQL
- No auto-delete of DB files

## Runtime notes

- **Runtime migrator** (`migrate()` from `drizzle-orm/better-sqlite3/migrator`): Node 18 compatible
- **drizzle-kit generate**: dev host only (Node 24 per `.nvmrc`); output is plain SQL + JSON files consumable by Node 18 runtime
- Database: SQLite via `better-sqlite3`
- Migration journal: `__drizzle_migrations` table (auto-created by migrator)

## Testing

- `createTestDb(migrationsDir)` applies migrations via official migrator — tests use the same path as production
- Coverage: fresh apply, second apply no-op, `__drizzle_migrations` has expected rows, trigger tests pass
- Run: `pnpm --filter @spicyhome/db test` or `bazel test //packages/db:test`

## References

- Issue: [#51 — Drizzle journaled migrations](https://github.com/fahimalizain/spicyhome-ksa/issues/51)
- `packages/db/src/schema.ts` — Drizzle table definitions (source of truth)
- `packages/db/src/migrate.ts` — `applyMigrations`, `findMigrationsDir`, `createTestDb`, `resolveDbPath`
- `packages/db/drizzle.config.ts` — drizzle-kit configuration
- `apps/server/src/modules/database/database.module.ts` — server boot migration
- `packaging/build-package.sh` — packages entire `drizzle/` for Win7
