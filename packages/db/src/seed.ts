import { hashSync } from 'bcryptjs';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const now = Math.floor(Date.now() / 1000);

/**
 * DEV SEED — inserts baseline roles, default admin user, tables,
 * categories, and menu items for an Indian restaurant.
 *
 * Roles:
 *   - admin: all permissions = 1
 *   - staff: create_order = 1, update_order = 1, rest = 0 (incl. pay_order)
 *
 * Admin user:
 *   - username: admin
 *   - PIN: 1234 (bcrypt-hashed)
 *   - role: admin
 *
 * Tables: T1 – T5
 *
 * Categories (7): Starters, Tandoori & Grill, Curries,
 *   Biryani & Rice, Breads, Beverages, Desserts
 *
 * Items: ~28 Indian restaurant dishes with name_ar and realistic SAR pricing.
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
  seedAdminUser(effectiveSqlite);
  seedTables(effectiveSqlite);
  seedCategories(effectiveSqlite);
  seedItems(effectiveSqlite);
  seedPaymentMethods(effectiveSqlite);
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

function seedAdminUser(sqlite: Database.Database): void {
  const existing = sqlite
    .prepare('SELECT COUNT(*) as cnt FROM users WHERE username = ?')
    .get('admin') as { cnt: number };

  if (existing.cnt > 0) return;

  const pinHash = hashSync('1234', 10);
  sqlite.exec(`
    INSERT INTO users (username, pin_hash, name, role_id, is_active, created_at, updated_at)
    VALUES ('admin', '${pinHash}', 'Administrator', 1, 1, ${now}, ${now});
  `);
}

function seedTables(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM tables').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  sqlite.exec(`
    INSERT INTO tables (name, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('T1', 1, 1, ${now}, ${now}, 1, 1);
    INSERT INTO tables (name, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('T2', 2, 1, ${now}, ${now}, 1, 1);
    INSERT INTO tables (name, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('T3', 3, 1, ${now}, ${now}, 1, 1);
    INSERT INTO tables (name, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('T4', 4, 1, ${now}, ${now}, 1, 1);
    INSERT INTO tables (name, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('T5', 5, 1, ${now}, ${now}, 1, 1);
  `);
}

function seedCategories(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM item_categories').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  sqlite.exec(`
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Starters', 1, NULL, 1, ${now}, ${now}, 1, 1);
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Tandoori & Grill', 2, NULL, 1, ${now}, ${now}, 1, 1);
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Curries', 3, NULL, 1, ${now}, ${now}, 1, 1);
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Biryani & Rice', 4, NULL, 1, ${now}, ${now}, 1, 1);
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Breads', 5, NULL, 1, ${now}, ${now}, 1, 1);
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Beverages', 6, NULL, 1, ${now}, ${now}, 1, 1);
    INSERT INTO item_categories (name, sort_order, printer_id, is_active, created_at, updated_at, created_by, updated_by)
    VALUES ('Desserts', 7, NULL, 1, ${now}, ${now}, 1, 1);
  `);
}

function seedItems(sqlite: Database.Database): void {
  const existing = sqlite.prepare('SELECT COUNT(*) as cnt FROM items').get() as {
    cnt: number;
  };

  if (existing.cnt > 0) return;

  sqlite.exec(`
    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Samosa (4 pcs)', 'سمبوسة (٤ قطع)', 1200, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Starters';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Onion Bhaji', 'باجي البصل', 1000, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Starters';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Pani Puri', 'باني بوري', 1500, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Starters';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Chicken Tikka', 'تشكن تكا', 1800, 1500, 4, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Starters';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Seekh Kebab', 'سيك كباب', 2000, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Tandoori & Grill';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Tandoori Chicken (Half)', 'دجاج تندوري (نصف)', 2200, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Tandoori & Grill';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Tandoori Chicken (Full)', 'دجاج تندوري (كامل)', 3800, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Tandoori & Grill';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Chicken Malai Tikka', 'تشكن مالاي تكا', 2400, 1500, 4, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Tandoori & Grill';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Butter Chicken', 'دجاج بالزبدة', 2400, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Curries';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Chicken Tikka Masala', 'تشكن تكا ماسالا', 2700, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Curries';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Dal Makhani', 'دال ماخاني', 1800, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Curries';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Palak Paneer', 'بالك بانير', 2000, 1500, 4, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Curries';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Lamb Rogan Josh', 'لحم روجان جوش', 3200, 1500, 5, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Curries';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Chicken Biryani', 'برياني الدجاج', 2200, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Biryani & Rice';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Mutton Biryani', 'برياني اللحم', 2800, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Biryani & Rice';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Veg Biryani', 'برياني الخضار', 1800, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Biryani & Rice';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Jeera Rice', 'أرز بالكمون', 1000, 1500, 4, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Biryani & Rice';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Butter Naan', 'نان بالزبدة', 400, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Breads';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Garlic Naan', 'نان بالثوم', 500, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Breads';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Tandoori Roti', 'روتي التندور', 300, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Breads';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Laccha Paratha', 'لاتشا باراثا', 500, 1500, 4, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Breads';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Mango Lassi', 'لاسي المانجو', 1200, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Beverages';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Sweet Lassi', 'لاسي الحلو', 1000, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Beverages';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Masala Chai', 'شاي ماسالا', 600, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Beverages';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Fresh Lime Soda', 'صودا الليمون الطازج', 800, 1500, 4, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Beverages';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Gulab Jamun (2 pcs)', 'جولاب جامون (قطعتين)', 1200, 1500, 1, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Desserts';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Rasmalai', 'راس ملائي', 1500, 1500, 2, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Desserts';

    INSERT INTO items (category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at, created_by, updated_by)
    SELECT c.id, 'Kheer', 'خير (أرز بالحليب)', 1000, 1500, 3, 1, ${now}, ${now}, 1, 1
    FROM item_categories c WHERE c.name = 'Desserts';
  `);
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
    INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
    VALUES ('cash', 'Cash', 1, 0, ${now}, ${now});
    INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
    VALUES ('card', 'Card', 1, 1, ${now}, ${now});
    INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
    VALUES ('mada', 'mada', 1, 2, ${now}, ${now});
  `);
}

/**
 * SHORTCUT: given a raw better-sqlite3 Database, run the entire seed.
 */
export function seedRaw(sqlite: Database.Database): void {
  seed(sqlite);
}
