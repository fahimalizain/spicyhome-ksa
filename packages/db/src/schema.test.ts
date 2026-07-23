import Database from 'better-sqlite3';
import { createTestDb, findMigrationsDir, applyMigrations } from './migrate';

describe('schema — migrations', () => {
  let migrationsDir: string;

  beforeAll(() => {
    migrationsDir = findMigrationsDir();
  });

  it('applies migrations cleanly to a :memory: database', () => {
    const sqlite = new Database(':memory:');
    expect(() => applyMigrations(sqlite, migrationsDir)).not.toThrow();
    sqlite.close();
  });

  it('applies migrations cleanly to a temp file database', () => {
    const sqlite = createTestDb(migrationsDir);
    expect(() => sqlite.close()).not.toThrow();
  });
});

describe('schema — invariants', () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    const migrationsDir = findMigrationsDir();
    sqlite = createTestDb(migrationsDir);
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('table existence', () => {
    const expectedTables = [
      'users',
      'user_roles',
      'tables',
      'printers',
      'item_categories',
      'items',
      'orders',
      'order_items',
      'order_audit_log',
      'invoices',
      'day_openings',
      'settings',
    ];

    for (const table of expectedTables) {
      it(`table ${table} exists`, () => {
        const row = sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
          .get(table);
        expect(row).not.toBeUndefined();
      });
    }
  });

  describe('foreign keys', () => {
    it('users.role_id references user_roles.id', () => {
      // Insert user_roles row
      const now = Math.floor(Date.now() / 1000);
      sqlite.exec(`
        INSERT INTO user_roles (name, created_at, updated_at)
        VALUES ('test_role', ${now}, ${now})
      `);
      const roleId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Insert user referencing role
      sqlite.exec(`
        INSERT INTO users (username, pin_hash, name, role_id, created_at, updated_at)
        VALUES ('testuser', 'hash', 'Test', ${roleId}, ${now}, ${now})
      `);

      // Verify
      const user = sqlite.prepare('SELECT * FROM users WHERE username = ?').get('testuser') as any;
      expect(user.role_id).toBe(roleId);

      // Delete role — should fail due to FK (unless CASCADE)
      expect(() => sqlite.exec(`DELETE FROM user_roles WHERE id = ${roleId}`)).toThrow();
    });

    it('orders.day_opening_id references day_openings.id', () => {
      const now = Math.floor(Date.now() / 1000);
      // Need a user first
      sqlite.exec(`
        INSERT INTO user_roles (name, created_at, updated_at) VALUES ('tmp', ${now}, ${now});
      `);
      const roleId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO users (username, pin_hash, name, role_id, created_at, updated_at)
        VALUES ('tmpuser', 'hash', 'Tmp', ${roleId}, ${now}, ${now})
      `);
      const userId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-01', 'open', ${now}, ${userId}, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (1, 'uuid-1', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);

      // Should fail if day_opening_id doesn't exist
      expect(() =>
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
          VALUES (2, 'uuid-2', 'dine_in', 99999, 'open', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('order_items.order_id references orders.id with cascade delete', () => {
      const now = Math.floor(Date.now() / 1000);
      // Set up dependencies
      const userRow = sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any;

      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-02', 'open', ${now}, ${userRow.id}, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (1, 'uuid-cascade', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (${orderId}, 'Test Item', 1000, 1500, 1, 1000, ${now}, ${now})
      `);

      // Cascade delete: deleting order should delete order_items
      sqlite.exec(`DELETE FROM orders WHERE id = ${orderId}`);
      const items = sqlite
        .prepare('SELECT COUNT(*) as cnt FROM order_items WHERE order_id = ?')
        .get(orderId) as any;
      expect(items.cnt).toBe(0);
    });
  });

  describe('unique constraints', () => {
    it('users.username is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const roleId = (sqlite.prepare('SELECT id FROM user_roles LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO users (username, pin_hash, name, role_id, created_at, updated_at)
        VALUES ('unique_test', 'hash', 'Test', ${roleId}, ${now}, ${now})
      `);

      expect(() =>
        sqlite.exec(`
          INSERT INTO users (username, pin_hash, name, role_id, created_at, updated_at)
          VALUES ('unique_test', 'hash', 'Test2', ${roleId}, ${now}, ${now})
        `),
      ).toThrow();
    });

    it('orders.uuid is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (99, 'uuid-unique', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);

      expect(() =>
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
          VALUES (100, 'uuid-unique', 'dine_in', ${doId}, 'open', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('invoices.order_id is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Create order first
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (101, 'uuid-inv-1', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, 1, 'inv-uuid-1', 'hash1', 'prevhash', '<xml/>', 'tlv', 'signed', ${now}, ${now})
      `);

      expect(() =>
        sqlite.exec(`
          INSERT INTO invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
          VALUES (${orderId}, 2, 'inv-uuid-2', 'hash2', 'prevhash', '<xml/>', 'tlv', 'signed', ${now}, ${now})
        `),
      ).toThrow();
    });
  });
});
