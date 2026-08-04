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
    expect(admin.pay_order).toBe(1);
    expect(admin.manage_menu).toBe(1);
    expect(admin.manage_tables).toBe(1);
    expect(admin.manage_printers).toBe(1);
    expect(admin.manage_users).toBe(1);
    expect(admin.manage_settings).toBe(1);

    // Staff has all permissions except manage_tables, manage_users, manage_settings
    expect(staff.create_order).toBe(1);
    expect(staff.update_order).toBe(1);
    expect(staff.delete_order_item).toBe(1);
    expect(staff.void_order).toBe(1);
    expect(staff.refund_order).toBe(1);
    expect(staff.pay_order).toBe(1);
    expect(staff.manage_menu).toBe(1);
    expect(staff.manage_tables).toBe(0);
    expect(staff.manage_printers).toBe(1);
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

  it('inserts cashier user with PIN 1, staff role, and android_login = 0', () => {
    seedRaw(sqlite);

    const cashier = sqlite.prepare('SELECT * FROM users WHERE username = ?').get('cashier') as any;
    const staffRole = sqlite
      .prepare('SELECT id FROM user_roles WHERE name = ?')
      .get('staff') as any;

    expect(cashier).toBeDefined();
    expect(cashier.name).toBe('Cashier');
    expect(cashier.role_id).toBe(staffRole.id);
    expect(cashier.is_active).toBe(1);
    expect(cashier.android_login).toBe(0);

    // PIN hash should be bcrypt of 1 (starts with $2a$ or $2b$)
    expect(cashier.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(cashier.pin_hash).not.toBe('1');
    expect(compareSync('1', cashier.pin_hash)).toBe(true);
  });

  it('inserts waiter user with PIN 2, staff role, and android_login = 1', () => {
    seedRaw(sqlite);

    const waiter = sqlite.prepare('SELECT * FROM users WHERE username = ?').get('waiter') as any;
    const staffRole = sqlite
      .prepare('SELECT id FROM user_roles WHERE name = ?')
      .get('staff') as any;

    expect(waiter).toBeDefined();
    expect(waiter.name).toBe('Waiter');
    expect(waiter.role_id).toBe(staffRole.id);
    expect(waiter.is_active).toBe(1);
    expect(waiter.android_login).toBe(1);

    // PIN hash should be bcrypt of 2 (starts with $2a$ or $2b$)
    expect(waiter.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(waiter.pin_hash).not.toBe('2');
    expect(compareSync('2', waiter.pin_hash)).toBe(true);
  });

  it('inserts 40 tables (T1 – T40 from RMS dump)', () => {
    seedRaw(sqlite);

    const tables = sqlite.prepare('SELECT * FROM tables ORDER BY sort_order').all() as any[];
    expect(tables.length).toBe(40);

    const expectedNames = Array.from({ length: 40 }, (_, i) => `T${i + 1}`);
    expect(tables.map((t: any) => t.name)).toEqual(expectedNames);
    expect(tables.map((t: any) => t.sort_order)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );

    tables.forEach((t: any) => {
      expect(t.is_active).toBe(1);
      expect(t.created_by).toBe(1);
    });

    // Spot-check first/last tables
    const first = sqlite.prepare("SELECT * FROM tables WHERE name = 'T1'").get() as any;
    const last = sqlite.prepare("SELECT * FROM tables WHERE name = 'T40'").get() as any;
    expect(first).toBeDefined();
    expect(first.sort_order).toBe(1);
    expect(last).toBeDefined();
    expect(last.sort_order).toBe(40);
  });

  it('inserts 7 categories (Courses only, Title Case)', () => {
    seedRaw(sqlite);

    const categories = sqlite
      .prepare('SELECT * FROM item_categories ORDER BY sort_order')
      .all() as any[];
    expect(categories.length).toBe(7);
    expect(categories.map((c: any) => c.name)).toEqual([
      'Soup',
      'Starters',
      'Tandoori',
      'Main Course',
      'Rice & Noodles',
      'Breads',
      'Desserts',
    ]);
    categories.forEach((c: any) => {
      expect(c.is_active).toBe(1);
      expect(c.printer_id).toBeNull();
    });
  });

  it('inserts 17 sub-categories (SubCourses, Title Case, linked to parents)', () => {
    seedRaw(sqlite);

    const subcategories = sqlite
      .prepare(
        `SELECT sc.*, c.name as category_name
         FROM item_subcategories sc
         JOIN item_categories c ON c.id = sc.category_id
         ORDER BY c.sort_order, sc.sort_order`,
      )
      .all() as any[];
    expect(subcategories.length).toBe(17);
    expect(subcategories.map((s: any) => `${s.category_name} / ${s.name}`)).toEqual([
      'Soup / Veg',
      'Soup / Non Veg',
      'Starters / Starters',
      'Starters / Salads',
      'Tandoori / Grill',
      'Main Course / Chicken',
      'Main Course / Mutton',
      'Main Course / Seafood',
      'Main Course / Vegetable',
      'Main Course / Delivery',
      'Rice & Noodles / Rice',
      'Rice & Noodles / Noodles',
      'Breads / Breads',
      'Desserts / Juices',
      'Desserts / Ice Creams',
      'Desserts / Beverages',
      'Desserts / Sweets',
    ]);
    subcategories.forEach((s: any) => {
      expect(s.is_active).toBe(1);
      expect(Number.isInteger(s.sort_order)).toBe(true);
      expect(s.sort_order).toBeGreaterThan(0);
    });
  });

  it('inserts all 204 RMS items (170 active, 34 inactive)', () => {
    seedRaw(sqlite);

    const items = sqlite
      .prepare('SELECT * FROM items ORDER BY category_id, sort_order')
      .all() as any[];
    expect(items.length).toBe(204);

    const active = items.filter((i: any) => i.is_active === 1);
    const inactive = items.filter((i: any) => i.is_active === 0);
    expect(active.length).toBe(170);
    expect(inactive.length).toBe(34);

    items.forEach((i: any) => {
      expect(i.category_id).toBeGreaterThan(0);
      expect(i.subcategory_id).toBeGreaterThan(0);
      expect(Number.isInteger(i.price_halalas)).toBe(true);
      expect(i.price_halalas).toBeGreaterThanOrEqual(0); // 0 allowed for freebies
      expect(i.vat_rate_bp).toBe(1500);
    });
  });

  it('spot-checks known RMS items (Prawn Soup, Chicken Biryani, freebies)', () => {
    seedRaw(sqlite);

    const getItem = (name: string): any =>
      sqlite.prepare('SELECT * FROM items WHERE name = ?').get(name);

    // Prawn Soup: rate 20 SAR -> 2000 halalas, Soup category + Non Veg
    // sub-category, Arabic name intact
    const prawnSoup = getItem('Prawn Soup');
    expect(prawnSoup).toBeDefined();
    expect(prawnSoup.price_halalas).toBe(2000);
    expect(prawnSoup.is_active).toBe(1);
    expect(prawnSoup.vat_rate_bp).toBe(1500);
    expect(prawnSoup.name_ar).toBe('شوربة ربيان');
    const prawnCategory = sqlite
      .prepare('SELECT name FROM item_categories WHERE id = ?')
      .get(prawnSoup.category_id) as any;
    expect(prawnCategory.name).toBe('Soup');
    const prawnSubcategory = sqlite
      .prepare('SELECT name FROM item_subcategories WHERE id = ?')
      .get(prawnSoup.subcategory_id) as any;
    expect(prawnSubcategory.name).toBe('Non Veg');

    // Chicken Biryani: dump rate is 40 SAR -> 4000 halalas
    const chickenBiryani = getItem('Chicken Biryani');
    expect(chickenBiryani).toBeDefined();
    expect(chickenBiryani.price_halalas).toBe(4000);
    expect(chickenBiryani.is_active).toBe(1);
    const biryaniCategory = sqlite
      .prepare('SELECT name FROM item_categories WHERE id = ?')
      .get(chickenBiryani.category_id) as any;
    expect(biryaniCategory.name).toBe('Rice & Noodles');
    const biryaniSubcategory = sqlite
      .prepare('SELECT name FROM item_subcategories WHERE id = ?')
      .get(chickenBiryani.subcategory_id) as any;
    expect(biryaniSubcategory.name).toBe('Rice');

    // Free Nan: rate 0 -> 0 halalas (dump marks it active)
    const freeNan = getItem('Free Nan');
    expect(freeNan).toBeDefined();
    expect(freeNan.price_halalas).toBe(0);
    expect(freeNan.is_active).toBe(1);

    // An inactive item from the dump: Clear soup-Chicken (rate 12 SAR)
    const clearSoupChicken = getItem('Clear soup-Chicken');
    expect(clearSoupChicken).toBeDefined();
    expect(clearSoupChicken.is_active).toBe(0);
    expect(clearSoupChicken.price_halalas).toBe(1200);
  });

  it('stores empty Arabic names as NULL', () => {
    seedRaw(sqlite);

    const freeRoti = sqlite
      .prepare("SELECT name_ar FROM items WHERE name = 'Free Roti'")
      .get() as any;
    expect(freeRoti).toBeDefined();
    expect(freeRoti.name_ar).toBeNull();

    const milkTea = sqlite
      .prepare("SELECT name_ar FROM items WHERE name = 'Milk Tea'")
      .get() as any;
    expect(milkTea).toBeDefined();
    expect(milkTea.name_ar).toBeNull();
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

    const waiters = sqlite
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE username = 'waiter'")
      .get() as any;
    expect(waiters.cnt).toBe(1);

    const tables = sqlite.prepare('SELECT COUNT(*) as cnt FROM tables').get() as any;
    expect(tables.cnt).toBe(40);

    const categories = sqlite.prepare('SELECT COUNT(*) as cnt FROM item_categories').get() as any;
    expect(categories.cnt).toBe(7);

    const subcategories = sqlite
      .prepare('SELECT COUNT(*) as cnt FROM item_subcategories')
      .get() as any;
    expect(subcategories.cnt).toBe(17);

    const items = sqlite.prepare('SELECT COUNT(*) as cnt FROM items').get() as any;
    expect(items.cnt).toBe(204);

    const methods = sqlite.prepare('SELECT COUNT(*) as cnt FROM payment_methods').get() as any;
    expect(methods.cnt).toBe(3);
  });
});
