import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'fs';
import path from 'path';

/**
 * Apply journaled Drizzle migrations to a SQLite database.
 *
 * Uses the official drizzle-orm migrator which reads the `meta/_journal.json`
 * file and associated SQL files, writes a `__drizzle_migrations` tracking
 * table, and is idempotent (second run is a no-op).
 */
export function applyMigrations(sqlite: Database.Database, migrationsDir: string): void {
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: migrationsDir });
}

/**
 * Resolve the database file path.
 *
 * Uses SPICYHOME_DB if set (worktree `.env.worktree`), otherwise defaults to
 * `./data/spicyhome.db` relative to the current working directory (or
 * Bazel workspace root when running under Bazel).
 */
export function resolveDbPath(): string {
  const raw = process.env.SPICYHOME_DB || './data/spicyhome.db';

  if (path.isAbsolute(raw)) return raw;

  const root = process.env.BUILD_WORKSPACE_DIRECTORY || process.cwd();
  return path.join(root, raw);
}

/**
 * Create a test database with migrations applied.
 *
 * If `dbPath` is provided, uses a file-based DB; otherwise uses `:memory:`.
 */
export function createTestDb(migrationsDir: string, dbPath?: string): Database.Database {
  const sqlite = new Database(dbPath ?? ':memory:');
  applyMigrations(sqlite, migrationsDir);
  return sqlite;
}

/**
 * Find the drizzle migrations directory.
 *
 * Prefers the MIGRATIONS_DIR environment variable (set by the startup
 * script in packaged builds).  Falls back to common locations for local
 * development and Bazel test sandboxes.
 *
 * The directory must contain a `meta/` subdirectory (the migration journal)
 * in addition to the `*.sql` files.
 */
export function findMigrationsDir(): string {
  if (process.env.MIGRATIONS_DIR && fs.existsSync(process.env.MIGRATIONS_DIR)) {
    return process.env.MIGRATIONS_DIR;
  }

  const candidates = [
    path.join(__dirname, 'drizzle'),
    path.join(__dirname, '..', 'drizzle'),
    path.join(process.env.RUNFILES_DIR || '', '_main', 'packages', 'db', 'drizzle'),
    path.join(process.env.TEST_SRCDIR || '', '_main', 'packages', 'db', 'drizzle'),
    path.join(process.env.BUILD_WORKSPACE_DIRECTORY || '', 'packages', 'db', 'drizzle'),
    path.join(process.cwd(), 'packages', 'db', 'drizzle'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Cannot find migrations directory. Tried: ${candidates.join(', ')}`);
}

// ── CLI entry (db:migrate) ─────────────────────────────────────────────────────

if (require.main === module) {
  try {
    const dbPath = resolveDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const migrationsDir = findMigrationsDir();

    const sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    applyMigrations(sqlite, migrationsDir);

    // Read back migration state for confirmation
    const appliedCount = (
      sqlite.prepare('SELECT COUNT(*) as cnt FROM __drizzle_migrations').get() as {
        cnt: number;
      }
    ).cnt;

    console.log(`Migrations applied successfully. ${appliedCount} migration(s) in journal.`);
    console.log(`DB path:      ${dbPath}`);
    console.log(`Migrations:   ${migrationsDir}`);

    sqlite.close();
    process.exit(0);
  } catch (err: any) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}
