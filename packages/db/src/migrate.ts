import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Apply SQL migration files to a SQLite database.
 *
 * Reads .sql files from `migrationsDir` (sorted by name), executes them
 * against the given Database instance.
 */
export function applyMigrations(sqlite: Database.Database, migrationsDir: string): void {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  sqlite.exec('PRAGMA foreign_keys = OFF');

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    sqlite.exec(sql);
  }

  sqlite.exec('PRAGMA foreign_keys = ON');
}

/**
 * Create a test database with migrations applied.
 *
 * If `dbPath` is provided, uses a file-based DB; otherwise uses :memory:.
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
