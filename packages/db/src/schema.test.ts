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
      'order_events',
      'order_refunds',
      'order_refund_items',
      'zatca_invoices',
      'zatca_credit_notes',
      'day_openings',
      'settings',
      'payment_methods',
      'order_payments',
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

    it('zatca_invoices.order_id is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Create order first
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (101, 'uuid-inv-1', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, 1, 'inv-uuid-1', 'hash1', 'prevhash', '<xml/>', 'tlv', 'signed', ${now}, ${now})
      `);

      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
          VALUES (${orderId}, 2, 'inv-uuid-2', 'hash2', 'prevhash', '<xml/>', 'tlv', 'signed', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes.refund_id is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;

      // Create an order
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (200, 'uuid-cn-1', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Create a refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 1000, 150, 1150, 'test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-uuid-x', 1, 'cn-uuid-1', 'hash1', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
      `);

      // Second credit_note for same refund_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, ${refundId}, 'inv-uuid-y', 2, 'cn-uuid-2', 'hash2', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes.icv is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;

      // Create orders and refunds for two separate credit notes
      for (let i = 0; i < 2; i++) {
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
          VALUES (${201 + i}, 'uuid-cn-icv-${i}', 'dine_in', ${doId}, 'paid', ${now}, ${now})
        `);
        const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
        sqlite.exec(`
          INSERT INTO order_refunds (order_id, user_id, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
          VALUES (${orderId}, ${userId}, 1000, 150, 1150, 'test', ${now})
        `);
        const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, ${refundId}, 'inv-uuid-icv', ${10 + i}, 'cn-uuid-icv-${i}', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `);
      }

      // ICV 10 already used, inserting another with ICV 10 should fail
      // Need a new order + refund first
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (203, 'uuid-cn-icv-dup', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId3 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId3}, ${userId}, 1000, 150, 1150, 'test', ${now})
      `);
      const refundId3 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId3}, ${refundId3}, 'inv-uuid-icv-dup', 10, 'cn-uuid-icv-dup', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes.uuid is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (300, 'uuid-cn-uu-1', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 1000, 150, 1150, 'test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-uuid-uu', 20, 'cn-uuid-uu-1', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
      `);

      // Same UUID with different order/refund should fail
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (301, 'uuid-cn-uu-2', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId2 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId2}, ${userId}, 1000, 150, 1150, 'test', ${now})
      `);
      const refundId2 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId2}, ${refundId2}, 'inv-uuid-uu-2', 21, 'cn-uuid-uu-1', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes FK to orders and order_refunds are enforced', () => {
      const now = Math.floor(Date.now() / 1000);

      // FK to non-existent order_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (99999, 99999, 'inv-uuid-fk', 30, 'cn-uuid-fk', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();

      // FK to non-existent refund_id should fail
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (400, 'uuid-cn-fk', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, 99999, 'inv-uuid-fk2', 31, 'cn-uuid-fk2', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('order_payments (order_id, method_id) is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Ensure payment methods exist (seeded by migration)
      const pmCash = sqlite.prepare("SELECT id FROM payment_methods WHERE id = 'cash'").get() as any;
      expect(pmCash).toBeDefined();

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (500, 'uuid-op-unique', 'dine_in', ${doId}, 'paid', 1000, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (${orderId}, 'cash', 'Cash', 500, ${now})
      `);

      // Second payment for same order + method should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
          VALUES (${orderId}, 'cash', 'Cash', 500, ${now})
        `),
      ).toThrow();
    });

    it('order_payments FK to payment_methods is enforced', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (501, 'uuid-op-fk', 'dine_in', ${doId}, 'paid', 1000, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
          VALUES (${orderId}, 'nonexistent', 'Bad', 500, ${now})
        `),
      ).toThrow();
    });
  });

  describe('payment methods seed', () => {
    it('cash, card, and mada are seeded', () => {
      const rows = sqlite
        .prepare('SELECT id, title, enabled, sort_order FROM payment_methods ORDER BY sort_order')
        .all() as any[];
      expect(rows.length).toBe(3);
      expect(rows[0]).toMatchObject({ id: 'cash', title: 'Cash', enabled: 1, sort_order: 0 });
      expect(rows[1]).toMatchObject({ id: 'card', title: 'Card', enabled: 1, sort_order: 1 });
      expect(rows[2]).toMatchObject({ id: 'mada', title: 'mada', enabled: 1, sort_order: 2 });
    });
  });
});
