import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Apply SQL migration files to a SQLite database.
 *
 * Reads .sql files from `migrationsDir` (sorted by name), executes them
 * against the given Database instance.
 */
export function applyMigrations(
  sqlite: Database.Database,
  migrationsDir: string,
): void {
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
export function createTestDb(
  migrationsDir: string,
  dbPath?: string,
): Database.Database {
  const sqlite = new Database(dbPath ?? ':memory:');
  applyMigrations(sqlite, migrationsDir);
  return sqlite;
}

/**
 * Find the drizzle migrations directory relative to the workspace root.
 *
 * Under Bazel's runfiles, data files are symlinked preserving the
 * workspace-relative path structure. We use a heuristic that tries
 * several possible locations.
 */
export function findMigrationsDir(): string {
  // In Bazel sandbox, the runfiles are under the execroot.
  // The package path (packages/db/drizzle) is preserved.
  const candidates = [
    // Direct run (pnpm jest): relative to __dirname
    path.join(__dirname, '..', 'drizzle'),
    // Bazel runfiles: relative to workspace root in execroot
    path.join(process.env.RUNFILES_DIR || '', '_main', 'packages', 'db', 'drizzle'),
    path.join(process.env.TEST_SRCDIR || '', '_main', 'packages', 'db', 'drizzle'),
    // Bazel 7: other possible paths
    path.join(process.env.BUILD_WORKSPACE_DIRECTORY || '', 'packages', 'db', 'drizzle'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Last resort: try the relative path from CWD
  const cwdCandidate = path.join(process.cwd(), 'packages', 'db', 'drizzle');
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }

  throw new Error(
    `Cannot find migrations directory. Tried: ${candidates.join(', ')}, ${cwdCandidate}`,
  );
}
