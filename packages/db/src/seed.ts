import { hashSync } from 'bcryptjs';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { userRoles, users } from './schema';

const now = Math.floor(Date.now() / 1000);

/**
 * DEV SEED — inserts baseline roles and a default admin user.
 *
 * Roles:
 *   - admin: all permissions = 1
 *   - staff: create_order = 1, update_order = 1, rest = 0
 *
 * Admin user:
 *   - username: admin
 *   - PIN: 1234 (bcrypt-hashed)
 *   - role: admin
 *
 * Idempotent: skips insert if roles/user already exist.
 */
export function seed(sqliteOrDb: Database.Database | BetterSQLite3Database): void {
  const sqlite = 'exec' in sqliteOrDb ? (sqliteOrDb as Database.Database) : undefined;
  const db = 'insert' in sqliteOrDb ? (sqliteOrDb as BetterSQLite3Database) : drizzle(sqlite!);

  const adminRole = db
    .select()
    .from(userRoles)
    .where(
      // drizzle where expects SQL
      undefined as any,
    )
    .all();

  // Check using raw SQL for simplicity since drizzle query builder is verbose
  const execSql = sqlite ? sqlite : 'exec' in (db as any).run ? undefined : undefined;

  // Use the raw sqlite instance to check existence
  const rawDb = sqlite ?? ((db as any).run as any);
  const checkSqlite = 'prepare' in sqliteOrDb ? (sqliteOrDb as Database.Database) : undefined;

  // Actually, let's use a simpler approach — just do the inserts with OR IGNORE
  const effectiveSqlite = findSqlite(db, sqlite);
  if (!effectiveSqlite) {
    throw new Error('Cannot get raw sqlite instance for seed');
  }

  const existingRoles = effectiveSqlite.prepare('SELECT COUNT(*) as cnt FROM user_roles').get() as {
    cnt: number;
  };

  if (existingRoles.cnt === 0) {
    effectiveSqlite.exec(`
      INSERT INTO user_roles (name, create_order, update_order, delete_order_item, void_order, refund_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES ('admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${now}, ${now});

      INSERT INTO user_roles (name, create_order, update_order, delete_order_item, void_order, refund_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES ('staff', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, ${now}, ${now});
    `);
  }

  const existingAdmin = effectiveSqlite
    .prepare('SELECT COUNT(*) as cnt FROM users WHERE username = ?')
    .get('admin') as { cnt: number };

  if (existingAdmin.cnt === 0) {
    const pinHash = hashSync('1234', 10);
    effectiveSqlite.exec(`
      INSERT INTO users (username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES ('admin', '${pinHash}', 'Administrator', 1, 1, ${now}, ${now});
    `);
  }
}

function findSqlite(
  db: BetterSQLite3Database,
  sqlite: Database.Database | undefined,
): Database.Database | undefined {
  if (sqlite) return sqlite;

  // drizzle-orm better-sqlite3 driver stores the raw db internally
  const anyDb = db as any;
  if (anyDb.run && typeof anyDb.run === 'function' && anyDb.run.constructor?.name === 'Database') {
    // This is the drizzle instance, try to extract the raw db
  }

  // Try common patterns
  if (anyDb._db) return anyDb._db;
  if (anyDb.db) return anyDb.db;
  if (anyDb.driver && anyDb.driver._db) return anyDb.driver._db;

  // Try the private symbol
  const keys = Object.getOwnPropertyNames(anyDb);
  for (const key of keys) {
    const val = anyDb[key];
    if (val && typeof val.prepare === 'function' && typeof val.exec === 'function') {
      return val;
    }
  }

  return undefined;
}

/**
 * SHORTCUT: given a raw better-sqlite3 Database, run the entire seed.
 */
export function seedRaw(sqlite: Database.Database): void {
  // Just run the drizzle version with the raw sqlite
  seed(sqlite);
}
