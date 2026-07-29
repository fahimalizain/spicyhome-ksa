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

  describe('journal idempotency', () => {
    it('__drizzle_migrations has exactly 5 rows after apply', () => {
      const sqlite = new Database(':memory:');
      applyMigrations(sqlite, migrationsDir);

      const rows = sqlite.prepare('SELECT COUNT(*) as cnt FROM __drizzle_migrations').get() as {
        cnt: number;
      };
      expect(rows.cnt).toBe(5);

      sqlite.close();
    });

    it('second applyMigrations is a no-op on the same DB', () => {
      const sqlite = new Database(':memory:');
      applyMigrations(sqlite, migrationsDir);

      const before = (
        sqlite.prepare('SELECT COUNT(*) as cnt FROM __drizzle_migrations').get() as {
          cnt: number;
        }
      ).cnt;

      // Second apply must not throw and must not add entries
      expect(() => applyMigrations(sqlite, migrationsDir)).not.toThrow();

      const after = (
        sqlite.prepare('SELECT COUNT(*) as cnt FROM __drizzle_migrations').get() as {
          cnt: number;
        }
      ).cnt;
      expect(after).toBe(before);
      expect(after).toBe(5);

      sqlite.close();
    });

    it('order_events triggers exist after apply', () => {
      const sqlite = new Database(':memory:');
      applyMigrations(sqlite, migrationsDir);

      const triggers = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
        .all() as { name: string }[];

      const names = triggers.map((t) => t.name);
      expect(names).toContain('order_events_no_update');
      expect(names).toContain('order_events_no_delete');
      expect(names.length).toBe(2);

      sqlite.close();
    });
  });
});

describe('schema — invariants', () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    const migrationsDir = findMigrationsDir();
    sqlite = createTestDb(migrationsDir);

    // Payment methods are no longer in migration SQL — they live in seed().
    // Insert them here so FK tests against payment_methods / order_payments work.
    const now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, ${now}, ${now});
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, ${now}, ${now});
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('mada', 'mada', 1, 2, ${now}, ${now});
    `);
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', 1000, 150, 1150, 'test', ${now})
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
          INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
          VALUES (${orderId}, ${userId}, 'cash', 'Cash', 1000, 150, 1150, 'test', ${now})
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId3}, ${userId}, 'cash', 'Cash', 1000, 150, 1150, 'test', ${now})
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', 1000, 150, 1150, 'test', ${now})
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId2}, ${userId}, 'cash', 'Cash', 1000, 150, 1150, 'test', ${now})
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

    it('zatca_credit_notes.reported_at column is nullable, zatca_invoices.reported_at column exists', () => {
      // Verify both tables have reported_at column
      const cnInfo = sqlite.prepare('PRAGMA table_info(zatca_credit_notes)').all() as any[];
      const cnReportedAt = cnInfo.find((c: any) => c.name === 'reported_at');
      expect(cnReportedAt).toBeDefined();
      expect(cnReportedAt.notnull).toBe(0); // nullable

      const invInfo = sqlite.prepare('PRAGMA table_info(zatca_invoices)').all() as any[];
      const invReportedAt = invInfo.find((c: any) => c.name === 'reported_at');
      expect(invReportedAt).toBeDefined();
    });

    it('order_payments (order_id, method_id) is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Ensure payment methods exist (seeded by beforeAll)
      const pmCash = sqlite
        .prepare("SELECT id FROM payment_methods WHERE id = 'cash'")
        .get() as any;
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

      // Second payment for same order + method should fail (unique index)
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

      // Ensure payment methods exist
      const pmCash = sqlite
        .prepare("SELECT id FROM payment_methods WHERE id = 'cash'")
        .get() as any;
      expect(pmCash).toBeDefined();

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (501, 'uuid-op-fk', 'dine_in', ${doId}, 'paid', 1000, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Valid payment method insert should succeed
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
          VALUES (${orderId}, 'card', 'Card', 500, ${now})
        `),
      ).not.toThrow();

      // FK to non-existent method_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
          VALUES (${orderId}, 'nonexistent', 'Bad', 500, ${now})
        `),
      ).toThrow();
    });
  });

  describe('orders — standard invoice buyer columns', () => {
    it('has is_standard_invoice and zatca_buyer_details columns on orders table', () => {
      const info = sqlite.prepare('PRAGMA table_info(orders)').all() as any[];
      const names = info.map((c: any) => c.name);

      expect(names).toContain('is_standard_invoice');
      expect(names).toContain('zatca_buyer_details');
      // Old buyer columns should be gone
      expect(names).not.toContain('buyer_name');
      expect(names).not.toContain('buyer_vat_number');
      expect(names).not.toContain('buyer_street');
      expect(names).not.toContain('buyer_building_number');
      expect(names).not.toContain('buyer_city_subdivision');
      expect(names).not.toContain('buyer_city');
      expect(names).not.toContain('buyer_postal_code');
      expect(names).not.toContain('buyer_country');
    });

    it('is_standard_invoice defaults to 0 when omitted on insert', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (601, 'uuid-sv-default', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const row = sqlite
        .prepare('SELECT is_standard_invoice FROM orders WHERE order_no = 601')
        .get() as any;
      expect(row.is_standard_invoice).toBe(0);
    });

    it('can insert with is_standard_invoice = 1 and buyer JSON, round-trip matches', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      const buyerJson = JSON.stringify({
        name: 'Fatoora Samples LTD',
        vatNumber: '399999999800003',
        street: 'Salah Al-Din',
        buildingNumber: '1111',
        citySubdivision: 'Al-Murooj',
        city: 'Riyadh',
        postalCode: '12222',
        country: 'SA',
      });

      sqlite.exec(`
        INSERT INTO orders (
          order_no, uuid, type, day_opening_id, status, created_at, updated_at,
          is_standard_invoice, zatca_buyer_details
        ) VALUES (
          602, 'uuid-sv-buyer-full', 'dine_in', ${doId}, 'open', ${now}, ${now},
          1, '${buyerJson.replace(/'/g, "''")}'
        )
      `);

      const row = sqlite.prepare('SELECT * FROM orders WHERE order_no = 602').get() as any;
      expect(row.is_standard_invoice).toBe(1);
      const parsed = JSON.parse(row.zatca_buyer_details);
      expect(parsed.name).toBe('Fatoora Samples LTD');
      expect(parsed.vatNumber).toBe('399999999800003');
      expect(parsed.street).toBe('Salah Al-Din');
      expect(parsed.buildingNumber).toBe('1111');
      expect(parsed.citySubdivision).toBe('Al-Murooj');
      expect(parsed.city).toBe('Riyadh');
      expect(parsed.postalCode).toBe('12222');
      expect(parsed.country).toBe('SA');
    });

    it('zatca_buyer_details accepts NULL', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (
          order_no, uuid, type, day_opening_id, status, created_at, updated_at
        ) VALUES (
          603, 'uuid-sv-buyer-null', 'dine_in', ${doId}, 'open', ${now}, ${now}
        )
      `);

      const row = sqlite.prepare('SELECT * FROM orders WHERE order_no = 603').get() as any;
      expect(row.zatca_buyer_details).toBeNull();
    });

    it('can update is_standard_invoice from 0 to 1 and back', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (604, 'uuid-sv-update', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT id FROM orders WHERE order_no = 604').get() as any)
        .id;

      // Set to 1
      sqlite.exec(`
        UPDATE orders SET is_standard_invoice = 1 WHERE id = ${orderId}
      `);
      let row = sqlite
        .prepare('SELECT is_standard_invoice FROM orders WHERE id = ?')
        .get(orderId) as any;
      expect(row.is_standard_invoice).toBe(1);

      // Set back to 0
      sqlite.exec(`
        UPDATE orders SET is_standard_invoice = 0 WHERE id = ${orderId}
      `);
      row = sqlite
        .prepare('SELECT is_standard_invoice FROM orders WHERE id = ?')
        .get(orderId) as any;
      expect(row.is_standard_invoice).toBe(0);
    });

    it('existing order insert without buyer fields still works', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // This is identical to inserts used elsewhere in the test suite — must still work
      expect(() =>
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
          VALUES (605, 'uuid-sv-existing', 'dine_in', ${doId}, 'open', ${now}, ${now})
        `),
      ).not.toThrow();

      const row = sqlite.prepare('SELECT * FROM orders WHERE order_no = 605').get() as any;
      expect(row.uuid).toBe('uuid-sv-existing');
      expect(row.status).toBe('open');
    });
  });
});
