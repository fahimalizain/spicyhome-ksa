import Database from 'better-sqlite3';
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

  it('inserts admin user with hashed PIN', () => {
    seedRaw(sqlite);

    const admin = sqlite.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;

    expect(admin).toBeDefined();
    expect(admin.name).toBe('Administrator');
    expect(admin.role_id).toBe(1);
    expect(admin.is_active).toBe(1);

    // PIN hash should be bcrypt (starts with $2a$ or $2b$)
    expect(admin.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(admin.pin_hash).not.toBe('1234');
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
  });
});
