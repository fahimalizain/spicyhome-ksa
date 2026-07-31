import Database from 'better-sqlite3';
import { compareSync } from 'bcryptjs';
import { createTestDb, findMigrationsDir } from './migrate';
import { seedRaw } from './seed';

describe('seed', () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    const migrationsDir = findMigrationsDir();
    sqlite = createTestDb(migrationsDir);
  });

  afterAll(() => {
    sqlite.close();
  });

  it('inserts admin and staff roles', () => {
    seedRaw(sqlite);

    const roles = sqlite.prepare('SELECT * FROM user_roles ORDER BY id').all() as any[];
    expect(roles.length).toBe(2);

    const admin = roles.find((r) => r.name === 'admin');
    const staff = roles.find((r) => r.name === 'staff');

    expect(admin).toBeDefined();
    expect(staff).toBeDefined();

    // Admin has all permissions
    expect(admin.create_order).toBe(1);
    expect(admin.update_order).toBe(1);
    expect(admin.delete_order_item).toBe(1);
    expect(admin.void_order).toBe(1);
    expect(admin.refund_order).toBe(1);
    expect(admin.manage_menu).toBe(1);
    expect(admin.manage_tables).toBe(1);
    expect(admin.manage_printers).toBe(1);
    expect(admin.manage_users).toBe(1);
    expect(admin.manage_settings).toBe(1);

    // Staff has limited permissions
    expect(staff.create_order).toBe(1);
    expect(staff.update_order).toBe(1);
    expect(staff.delete_order_item).toBe(0);
    expect(staff.void_order).toBe(0);
    expect(staff.refund_order).toBe(0);
    expect(staff.manage_menu).toBe(0);
    expect(staff.manage_tables).toBe(0);
    expect(staff.manage_printers).toBe(0);
    expect(staff.manage_users).toBe(0);
    expect(staff.manage_settings).toBe(0);
  });

  it('inserts admin user with hashed PIN and android_login = 0', () => {
    seedRaw(sqlite);

    const admin = sqlite.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;
    const adminRole = sqlite
      .prepare('SELECT id FROM user_roles WHERE name = ?')
      .get('admin') as any;

    expect(admin).toBeDefined();
    expect(admin.name).toBe('Administrator');
    expect(admin.role_id).toBe(adminRole.id);
    expect(admin.is_active).toBe(1);
    expect(admin.android_login).toBe(0);

    // PIN hash should be bcrypt of 771133 (starts with $2a$ or $2b$)
    expect(admin.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(admin.pin_hash).not.toBe('771133');
    expect(compareSync('771133', admin.pin_hash)).toBe(true);
  });

  it('inserts cashier user with PIN 1, staff role, and android_login = 1', () => {
    seedRaw(sqlite);

    const cashier = sqlite.prepare('SELECT * FROM users WHERE username = ?').get('cashier') as any;
    const staffRole = sqlite
      .prepare('SELECT id FROM user_roles WHERE name = ?')
      .get('staff') as any;

    expect(cashier).toBeDefined();
    expect(cashier.name).toBe('Cashier');
    expect(cashier.role_id).toBe(staffRole.id);
    expect(cashier.is_active).toBe(1);
    expect(cashier.android_login).toBe(1);

    // PIN hash should be bcrypt of 1 (starts with $2a$ or $2b$)
    expect(cashier.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(cashier.pin_hash).not.toBe('1');
    expect(compareSync('1', cashier.pin_hash)).toBe(true);
  });

  it('inserts 5 tables', () => {
    seedRaw(sqlite);

    const tables = sqlite.prepare('SELECT * FROM tables ORDER BY sort_order').all() as any[];
    expect(tables.length).toBe(5);
    expect(tables.map((t: any) => t.name)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5']);
    tables.forEach((t: any) => {
      expect(t.is_active).toBe(1);
      expect(t.created_by).toBe(1);
    });
  });

  it('inserts 7 categories', () => {
    seedRaw(sqlite);

    const categories = sqlite
      .prepare('SELECT * FROM item_categories ORDER BY sort_order')
      .all() as any[];
    expect(categories.length).toBe(7);
    expect(categories.map((c: any) => c.name)).toEqual([
      'Starters',
      'Tandoori & Grill',
      'Curries',
      'Biryani & Rice',
      'Breads',
      'Beverages',
      'Desserts',
    ]);
    categories.forEach((c: any) => {
      expect(c.is_active).toBe(1);
      expect(c.printer_id).toBeNull();
    });
  });

  it('inserts 28 items across 7 categories', () => {
    seedRaw(sqlite);

    const items = sqlite
      .prepare('SELECT * FROM items ORDER BY category_id, sort_order')
      .all() as any[];
    expect(items.length).toBe(28);

    items.forEach((i: any) => {
      expect(i.category_id).toBeGreaterThan(0);
      expect(i.price_halalas).toBeGreaterThan(0);
      expect(i.vat_rate_bp).toBe(1500);
      expect(i.is_active).toBe(1);
      expect(i.name_ar).toBeTruthy();
    });
  });

  it('inserts 3 payment methods (cash, card, mada)', () => {
    seedRaw(sqlite);

    const methods = sqlite
      .prepare('SELECT * FROM payment_methods ORDER BY sort_order')
      .all() as any[];
    expect(methods.length).toBe(3);
    expect(methods.map((m: any) => m.id)).toEqual(['cash', 'card', 'mada']);
    expect(methods.map((m: any) => m.title)).toEqual(['Cash', 'Card', 'mada']);
    methods.forEach((m: any) => {
      expect(m.enabled).toBe(1);
    });
    // ZATCA UN/ECE 4461 Payment Means codes: cash → 10, card/mada → 48
    expect(methods.map((m: any) => m.zatca_payment_means_code)).toEqual(['10', '48', '48']);
  });

  it('is idempotent — running seed twice does not duplicate rows', () => {
    seedRaw(sqlite);
    seedRaw(sqlite);

    const roles = sqlite.prepare('SELECT COUNT(*) as cnt FROM user_roles').get() as any;
    expect(roles.cnt).toBe(2);

    const admins = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE username = 'admin'")
      .get() as any;
    expect(admins.cnt).toBe(1);

    const cashiers = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE username = 'cashier'")
      .get() as any;
    expect(cashiers.cnt).toBe(1);

    const tables = sqlite.prepare('SELECT COUNT(*) as cnt FROM tables').get() as any;
    expect(tables.cnt).toBe(5);

    const categories = sqlite.prepare('SELECT COUNT(*) as cnt FROM item_categories').get() as any;
    expect(categories.cnt).toBe(7);

    const items = sqlite.prepare('SELECT COUNT(*) as cnt FROM items').get() as any;
    expect(items.cnt).toBe(28);

    const methods = sqlite.prepare('SELECT COUNT(*) as cnt FROM payment_methods').get() as any;
    expect(methods.cnt).toBe(3);
  });
});
