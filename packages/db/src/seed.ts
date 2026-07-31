import { hashSync } from 'bcryptjs';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import catalogJson from './data/spicyhome_dump_20260731.json';

const now = Math.floor(Date.now() / 1000);

/** A course (POS category) from the RMS dump. */
interface DumpCourse {
  id: number;
  name: string;
  code: string;
}

/** A sub-course from the RMS dump; resolves items to their parent course. */
interface DumpSubCourse {
  id: number;
  name: string;
  code: string;
  course_id: number;
}

/** A menu item from the RMS dump. */
interface DumpItem {
  item_id: number;
  name: string;
  name_ar: string;
  code: string;
  rate: number;
  inactive: boolean;
  sub_course_id: number;
}

/** A dining table from the RMS dump (dbo.Tables); id is RMS provenance only. */
interface DumpTable {
  id: number;
  name: string;
  name_raw: string;
  dine_id: number;
  branch: number;
  inactive: boolean;
}

/** Shape of packages/db/src/data/spicyhome_dump_20260731.json. */
interface CatalogDump {
  meta: Record<string, unknown>;
  tables: DumpTable[];
  courses: DumpCourse[];
  sub_courses: DumpSubCourse[];
  items: DumpItem[];
}

/** The RMS catalog dump, typed explicitly. */
const catalog: CatalogDump = catalogJson;

/**
 * DEV SEED — inserts baseline roles, default admin user, tables,
 * categories, and menu items from the real SpicyHome RMS catalog.
 *
 * Catalog source: RMS dump `spicyhome_dump_20260731.json` (MSSQL SPICYHOME
 * backup SPICYHOME_20260731, extracted 2026-07-31).
 *
 * Category strategy (issue #99, option A — Course-only):
 *   - POS categories are the 7 Courses only (SOUP, STARTERS, TANDOORI,
 *     MAIN COURSE, RICE & NOODLES, BREADS, DESSERTS), display names
 *     Title Case.
 *   - SubCourse is NOT a POS category layer. It is only used to resolve
 *     each item's parent Course via
 *     item.sub_course_id -> sub_courses[].course_id -> courses[].
 *
 * Money:
 *   - Dump rates are VAT-inclusive SAR (see dump meta notes); converted to
 *     integer halalas with round-half-up: price_halalas = Math.round(rate * 100).
 *   - vat_rate_bp = 1500 (15%) for every item.
 *
 * All 204 dump items are seeded — inactive ones get is_active = 0. Empty
 * Arabic names are stored as NULL. Inserts use prepared statements, so
 * Arabic names are never string-interpolated into SQL.
 *
 * Roles:
 *   - admin: all permissions = 1
 *   - staff: create_order = 1, update_order = 1, rest = 0 (incl. pay_order)
 *
 * Users:
 *   - Admin (POS/back-office only): username admin, PIN 771133,
 *     role admin, android_login = 0 (hidden from Android login)
 *   - Cashier (tablet floor user): username cashier, name Cashier, PIN 1,
 *     role staff, android_login = 1 (shown on Android login)
 *
 * Tables: T1 – T40 from RMS dump (dbo.Tables, DineId=2, Branch=1).
 * Raw TableName 'T -  N' normalized to display name 'TN' (no spaces).
 *
 * Idempotent: skips insert if rows already exist.
 */
export function seed(sqliteOrDb: Database.Database | BetterSQLite3Database): void {
  const sqlite = 'exec' in sqliteOrDb ? (sqliteOrDb as Database.Database) : undefined;
  const db = 'insert' in sqliteOrDb ? (sqliteOrDb as BetterSQLite3Database) : drizzle(sqlite!);

  const effectiveSqlite = findSqlite(db, sqlite);
  if (!effectiveSqlite) {
    throw new Error('Cannot get raw sqlite instance for seed');
  }

  seedRoles(effectiveSqlite);
  seedUsers(effectiveSqlite);
  seedTables(effectiveSqlite);
  seedCategories(effectiveSqlite);
  seedItems(effectiveSqlite);
  seedPaymentMethods(effectiveSqlite);
}

/**
 * Converts a course name to a Title Case display name:
 * lowercases, then capitalizes each word (split on spaces). Non-letter
 * characters such as `&` are preserved as-is (`RICE & NOODLES` -> `Rice & Noodles`).
 */
function toTitleCase(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function seedRoles(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM user_roles').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  sqlite.exec(`
    INSERT INTO user_roles (name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
    VALUES ('admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${now}, ${now});

    INSERT INTO user_roles (name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
    VALUES ('staff', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, ${now}, ${now});
  `);
}

function seedUsers(sqlite: Database.Database): void {
  const adminRole = sqlite.prepare(`SELECT id FROM user_roles WHERE name = 'admin'`).get() as
    { id: number } | undefined;
  const staffRole = sqlite.prepare(`SELECT id FROM user_roles WHERE name = 'staff'`).get() as
    { id: number } | undefined;

  if (!adminRole || !staffRole) {
    throw new Error('Cannot seed users: admin/staff roles missing');
  }

  const insertUser = sqlite.prepare(`
    INSERT INTO users (username, pin_hash, name, role_id, is_active, android_login, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ${now}, ${now})
  `);

  const adminExists = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM users WHERE username = ?')
    .get('admin') as { cnt: number };
  if (adminExists.cnt === 0) {
    // Admin: POS/back-office only
    insertUser.run('admin', hashSync('771133', 10), 'Administrator', adminRole.id, 0);
  }

  const cashierExists = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM users WHERE username = ?')
    .get('cashier') as { cnt: number };
  if (cashierExists.cnt === 0) {
    // Cashier: tablet floor user
    insertUser.run('cashier', hashSync('1', 10), 'Cashier', staffRole.id, 1);
  }
}

function seedTables(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM tables').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  // Missing/empty dump tables is a data-integrity error; fail the seed
  // loudly instead of silently inserting nothing.
  if (!Array.isArray(catalog.tables) || catalog.tables.length === 0) {
    throw new Error('Seed integrity: catalog dump has no tables to seed');
  }

  const insert = sqlite.prepare(`
    INSERT INTO tables (name, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, 1, 1)
  `);

  const insertAll = sqlite.transaction(() => {
    // sort_order = RMS id ascending (167..206 -> T1..T40)
    const tables = [...catalog.tables].sort((a, b) => a.id - b.id);
    tables.forEach((table, index) => {
      insert.run(table.name, index + 1, table.inactive ? 0 : 1, now, now);
    });
  });

  insertAll();
}

function seedCategories(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM item_categories').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  const insert = sqlite.prepare(`
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, NULL, 1, ?, ?, 1, 1)
  `);

  const insertAll = sqlite.transaction(() => {
    // sort_order = course id ascending (1..7)
    const courses = [...catalog.courses].sort((a, b) => a.id - b.id);
    for (const course of courses) {
      insert.run(toTitleCase(course.name), course.id, now, now);
    }
  });

  insertAll();
}

function seedItems(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM items').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  // Resolve item -> sub_course -> course. Missing links are data-integrity
  // errors; fail the seed loudly instead of silently skipping items.
  const subCourseToCourse = new Map<number, number>();
  const courseIdSet = new Set(catalog.courses.map((c) => c.id));
  for (const subCourse of catalog.sub_courses) {
    if (!courseIdSet.has(subCourse.course_id)) {
      throw new Error(
        `Seed integrity: sub_course ${subCourse.id} (${subCourse.name}) references missing course ${subCourse.course_id}`,
      );
    }
    subCourseToCourse.set(subCourse.id, subCourse.course_id);
  }

  const categoryNameByCourseId = new Map(
    catalog.courses.map((c) => [c.id, toTitleCase(c.name)] as const),
  );

  // Look up seeded category ids once by display name.
  const categoryRows = sqlite.prepare('SELECT id, name FROM item_categories').all() as Array<{
    id: number;
    name: string;
  }>;
  const categoryIdByName = new Map(categoryRows.map((row) => [row.name, row.id]));

  // Stable ordering: item_id ascending; per-category sort_order 1..N.
  const items = [...catalog.items].sort((a, b) => a.item_id - b.item_id);

  // Prepared statement: Arabic names are bound as parameters, never
  // interpolated into SQL.
  const insert = sqlite.prepare(`
    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES (?, ?, ?, ?, 1500, ?, ?, ?, ?, 1, 1)
  `);

  const insertAll = sqlite.transaction(() => {
    const sortOrderByCategory = new Map<number, number>();

    for (const item of items) {
      const courseId = subCourseToCourse.get(item.sub_course_id);
      if (courseId === undefined) {
        throw new Error(
          `Seed integrity: item ${item.item_id} (${item.name}) references missing sub_course ${item.sub_course_id}`,
        );
      }

      const categoryName = categoryNameByCourseId.get(courseId);
      if (categoryName === undefined) {
        throw new Error(
          `Seed integrity: item ${item.item_id} (${item.name}) resolves to missing course ${courseId}`,
        );
      }

      const categoryId = categoryIdByName.get(categoryName);
      if (categoryId === undefined) {
        throw new Error(
          `Seed integrity: category '${categoryName}' was not seeded for course ${courseId}`,
        );
      }

      const sortOrder = (sortOrderByCategory.get(categoryId) ?? 0) + 1;
      sortOrderByCategory.set(categoryId, sortOrder);

      const nameAr = item.name_ar.trim() === '' ? null : item.name_ar;
      const priceHalalas = Math.round(item.rate * 100);
      const isActive = item.inactive ? 0 : 1;

      insert.run(categoryId, item.name, nameAr, priceHalalas, sortOrder, isActive, now, now);
    }
  });

  insertAll();
}

function findSqlite(
  db: BetterSQLite3Database,
  sqlite: Database.Database | undefined,
): Database.Database | undefined {
  if (sqlite) return sqlite;

  const anyDb = db as any;

  if (anyDb._db) return anyDb._db;
  if (anyDb.db) return anyDb.db;
  if (anyDb.driver && anyDb.driver._db) return anyDb.driver._db;

  const keys = Object.getOwnPropertyNames(anyDb);
  for (const key of keys) {
    const val = anyDb[key];
    if (val && typeof val.prepare === 'function' && typeof val.exec === 'function') {
      return val;
    }
  }

  return undefined;
}

function seedPaymentMethods(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM payment_methods').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  sqlite.exec(`
    INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
    VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
    INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
    VALUES ('card', 'Card', 1, 1, '48', ${now}, ${now});
    INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
    VALUES ('mada', 'mada', 1, 2, '48', ${now}, ${now});
  `);
}

/**
 * SHORTCUT: given a raw better-sqlite3 Database, run the entire seed.
 */
export function seedRaw(sqlite: Database.Database): void {
  seed(sqlite);
}
