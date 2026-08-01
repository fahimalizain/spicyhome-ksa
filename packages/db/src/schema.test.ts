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
    it('__drizzle_migrations has exactly 13 rows after apply', () => {
      const sqlite = new Database(':memory:');
      applyMigrations(sqlite, migrationsDir);

      const rows = sqlite.prepare('SELECT COUNT(*) as cnt FROM __drizzle_migrations').get() as {
        cnt: number;
      };
      expect(rows.cnt).toBe(13);

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
      expect(after).toBe(13);

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
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, '48', ${now}, ${now});
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('mada', 'mada', 1, 2, '48', ${now}, ${now});
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
      'item_subcategories',
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
      'delivery_partners',
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

  describe('users — android_login column', () => {
    it('has android_login column with default 1', () => {
      const info = sqlite.prepare('PRAGMA table_info(users)').all() as any[];
      const col = info.find((c: any) => c.name === 'android_login');
      expect(col).toBeDefined();
      expect(col.notnull).toBe(1);
      expect(col.dflt_value).toBe('1');
    });

    it('android_login defaults to 1 when omitted on insert', () => {
      const now = Math.floor(Date.now() / 1000);
      sqlite.exec(`
        INSERT INTO user_roles (name, created_at, updated_at) VALUES ('android_default_role', ${now}, ${now});
      `);
      const roleId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO users (username, pin_hash, name, role_id, created_at, updated_at)
        VALUES ('android_default_user', 'hash', 'Android Default', ${roleId}, ${now}, ${now})
      `);
      const row = sqlite
        .prepare("SELECT android_login FROM users WHERE username = 'android_default_user'")
        .get() as any;
      expect(row.android_login).toBe(1);
    });
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

  describe('delivery partners', () => {
    it('delivery_partners table has expected columns (ADR 0007)', () => {
      const info = sqlite.prepare('PRAGMA table_info(delivery_partners)').all() as any[];
      const cols = info.map((c: any) => c.name);
      expect(cols).toEqual(
        expect.arrayContaining([
          'id',
          'title',
          'enabled',
          'sort_order',
          'created_at',
          'updated_at',
          'created_by',
          'updated_by',
        ]),
      );

      // id is the TEXT primary key (slug)
      const id = info.find((c: any) => c.name === 'id') as any;
      expect(id.type.toLowerCase()).toBe('text');
      expect(id.pk).toBe(1);

      // enabled is NOT NULL with default 1
      const enabled = info.find((c: any) => c.name === 'enabled') as any;
      expect(enabled.notnull).toBe(1);
      expect(enabled.dflt_value).toBe('1');

      // sort_order is NOT NULL with default 0
      const sortOrder = info.find((c: any) => c.name === 'sort_order') as any;
      expect(sortOrder.notnull).toBe(1);
      expect(sortOrder.dflt_value).toBe('0');

      // Audit refs are nullable FKs to users
      const createdBy = info.find((c: any) => c.name === 'created_by') as any;
      expect(createdBy.notnull).toBe(0);
    });

    it('enabled defaults to 1 and sort_order to 0 on insert', () => {
      const now = Math.floor(Date.now() / 1000);
      sqlite.exec(`
        INSERT INTO delivery_partners (id, title, created_at, updated_at)
        VALUES ('hungerstation', 'HungerStation', ${now}, ${now})
      `);
      const row = sqlite
        .prepare("SELECT * FROM delivery_partners WHERE id = 'hungerstation'")
        .get() as any;
      expect(row.title).toBe('HungerStation');
      expect(row.enabled).toBe(1);
      expect(row.sort_order).toBe(0);
    });

    it('orders has delivery_partner_id and delivery_external_ref columns (nullable)', () => {
      const info = sqlite.prepare('PRAGMA table_info(orders)').all() as any[];
      const partnerId = info.find((c: any) => c.name === 'delivery_partner_id') as any;
      expect(partnerId).toBeDefined();
      expect(partnerId.type.toLowerCase()).toBe('text');
      expect(partnerId.notnull).toBe(0);

      const extRef = info.find((c: any) => c.name === 'delivery_external_ref') as any;
      expect(extRef).toBeDefined();
      expect(extRef.type.toLowerCase()).toBe('text');
      expect(extRef.notnull).toBe(0);
    });

    it('orders has notes column (nullable, like order_items.notes)', () => {
      const info = sqlite.prepare('PRAGMA table_info(orders)').all() as any[];
      const col = info.find((c: any) => c.name === 'notes') as any;
      expect(col).toBeDefined();
      expect(col.type.toLowerCase()).toBe('text');
      expect(col.notnull).toBe(0);
    });

    it('orders.notes round-trips: null default, set and clear via update', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Insert without notes → NULL
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (803, 'uuid-notes-null', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      let row = sqlite.prepare('SELECT notes FROM orders WHERE order_no = 803').get() as any;
      expect(row.notes).toBeNull();

      // Set notes
      sqlite.exec(`
        UPDATE orders SET notes = 'call on arrival' WHERE order_no = 803
      `);
      row = sqlite.prepare('SELECT notes FROM orders WHERE order_no = 803').get() as any;
      expect(row.notes).toBe('call on arrival');

      // Clear notes back to NULL
      sqlite.exec(`
        UPDATE orders SET notes = NULL WHERE order_no = 803
      `);
      row = sqlite.prepare('SELECT notes FROM orders WHERE order_no = 803').get() as any;
      expect(row.notes).toBeNull();
    });

    it('idx_orders_delivery_partner index exists on orders(delivery_partner_id)', () => {
      const row = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_orders_delivery_partner'",
        )
        .get();
      expect(row).toBeDefined();
    });

    it('orders.delivery_partner_id FK to delivery_partners is enforced', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Unknown partner slug must fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, delivery_partner_id, created_at, updated_at)
          VALUES (800, 'uuid-dp-fk', 'takeaway', ${doId}, 'open', 'nonexistent', ${now}, ${now})
        `),
      ).toThrow();

      // Known partner round-trips together with the external ref
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, delivery_partner_id, delivery_external_ref, created_at, updated_at)
        VALUES (801, 'uuid-dp-ok', 'takeaway', ${doId}, 'open', 'hungerstation', 'HS-883129', ${now}, ${now})
      `);
      const row = sqlite.prepare('SELECT * FROM orders WHERE order_no = 801').get() as any;
      expect(row.delivery_partner_id).toBe('hungerstation');
      expect(row.delivery_external_ref).toBe('HS-883129');
    });

    it('walk-in takeaway insert without partner still works (nullable columns)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
          VALUES (802, 'uuid-dp-null', 'takeaway', ${doId}, 'open', ${now}, ${now})
        `),
      ).not.toThrow();

      const row = sqlite.prepare('SELECT * FROM orders WHERE order_no = 802').get() as any;
      expect(row.delivery_partner_id).toBeNull();
      expect(row.delivery_external_ref).toBeNull();
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

    it('zatca_invoices allows multiple attempts per order (no unique on order_id)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Create order first
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (101, 'uuid-inv-1', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // First attempt — rejected
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, 1, 'inv-uuid-1', 'DOC-' || 'inv-uuid-1', 'hash1', 'prevhash', '<xml/>', 'tlv', 'rejected', 1, ${now}, ${now})
      `);

      // Second attempt (reissue with new ICV) should succeed — no unique conflict on order_id
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
          VALUES (${orderId}, 2, 'inv-uuid-2', 'DOC-' || 'inv-uuid-2', 'hash2', 'prevhash2', '<xml/>', 'tlv', 'cleared', 2, ${now}, ${now})
        `),
      ).not.toThrow();
    });

    it('zatca_invoices only one cleared per order (partial unique index)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      // Create order
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (102, 'uuid-inv-partial', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // First cleared
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, 10, 'inv-uuid-p1', 'DOC-' || 'inv-uuid-p1', 'hash1', 'prev', '<xml/>', 'tlv', 'cleared', 1, ${now}, ${now})
      `);

      // Second cleared for same order must fail (partial unique index)
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
          VALUES (${orderId}, 11, 'inv-uuid-p2', 'DOC-' || 'inv-uuid-p2', 'hash2', 'prev', '<xml/>', 'tlv', 'cleared', 2, ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes allows multiple attempts per refund (no unique on refund_id)', () => {
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // First attempt — rejected
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-uuid-x', 1, 'cn-uuid-1', 'DOC-' || 'cn-uuid-1', 'hash1', 'prev', '<xml/>', 'tlv', 'rejected', 1, 1150, 150, 'test', ${now}, ${now})
      `);

      // Second attempt (reissue with new ICV) should succeed
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, ${refundId}, 'inv-uuid-y', 2, 'cn-uuid-2', 'DOC-' || 'cn-uuid-2', 'hash2', 'prev', '<xml/>', 'tlv', 'cleared', 2, 1150, 150, 'test', ${now}, ${now})
        `),
      ).not.toThrow();
    });

    it('zatca_credit_notes only one cleared per refund (partial unique index)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;

      // Create an order
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (201, 'uuid-cn-partial', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Create a refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // First cleared
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-uuid-cp', 20, 'cn-uuid-cp1', 'DOC-' || 'cn-uuid-cp1', 'hash1', 'prev', '<xml/>', 'tlv', 'cleared', 1, 1150, 150, 'test', ${now}, ${now})
      `);

      // Second cleared for same refund must fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, ${refundId}, 'inv-uuid-cp2', 21, 'cn-uuid-cp2', 'DOC-' || 'cn-uuid-cp2', 'hash2', 'prev', '<xml/>', 'tlv', 'cleared', 2, 1150, 150, 'test', ${now}, ${now})
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
          INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
          VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'test', ${now})
        `);
        const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, ${refundId}, 'inv-uuid-icv', ${10 + i}, 'cn-uuid-icv-${i}', 'DOC-' || 'cn-uuid-icv-${i}', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId3}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'test', ${now})
      `);
      const refundId3 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId3}, ${refundId3}, 'inv-uuid-icv-dup', 10, 'cn-uuid-icv-dup', 'DOC-' || 'cn-uuid-icv-dup', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-uuid-uu', 50, 'cn-uuid-uu-1', 'DOC-' || 'cn-uuid-uu-1', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
      `);

      // Same UUID with different order/refund should fail
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (301, 'uuid-cn-uu-2', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId2 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId2}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'test', ${now})
      `);
      const refundId2 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId2}, ${refundId2}, 'inv-uuid-uu-2', 51, 'cn-uuid-uu-1', 'DOC-' || 'cn-uuid-uu-1', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes FK to orders and order_refunds are enforced', () => {
      const now = Math.floor(Date.now() / 1000);

      // FK to non-existent order_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (99999, 99999, 'inv-uuid-fk', 30, 'cn-uuid-fk', 'DOC-' || 'cn-uuid-fk', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
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
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, 99999, 'inv-uuid-fk2', 31, 'cn-uuid-fk2', 'DOC-' || 'cn-uuid-fk2', 'hash', 'prev', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes has new clearance columns, zatca_invoices has new clearance columns', () => {
      // Verify both tables have the new clearance columns
      const cnInfo = sqlite.prepare('PRAGMA table_info(zatca_credit_notes)').all() as any[];
      const cnColumns = cnInfo.map((c: any) => c.name);
      expect(cnColumns).toContain('attempt_no');
      expect(cnColumns).toContain('clearance_errors');
      expect(cnColumns).toContain('clearance_warnings');
      expect(cnColumns).toContain('http_status');
      const cnReportedAt = cnInfo.find((c: any) => c.name === 'reported_at');
      expect(cnReportedAt).toBeDefined();
      expect(cnReportedAt.notnull).toBe(0); // nullable

      const invInfo = sqlite.prepare('PRAGMA table_info(zatca_invoices)').all() as any[];
      const invColumns = invInfo.map((c: any) => c.name);
      expect(invColumns).toContain('attempt_no');
      expect(invColumns).toContain('clearance_errors');
      expect(invColumns).toContain('clearance_warnings');
      expect(invColumns).toContain('http_status');
      const invReportedAt = invInfo.find((c: any) => c.name === 'reported_at');
      expect(invReportedAt).toBeDefined();
    });

    it('zatca_payment_means_code is NOT NULL on payment_methods, order_payments, order_refunds', () => {
      for (const table of ['payment_methods', 'order_payments', 'order_refunds']) {
        const info = sqlite.prepare(`PRAGMA table_info(${table})`).all() as any[];
        const col = info.find((c: any) => c.name === 'zatca_payment_means_code');
        expect(col).toBeDefined();
        expect(col.notnull).toBe(1);
      }
    });

    it('seeded payment methods carry ZATCA payment means codes', () => {
      const cash = sqlite
        .prepare("SELECT zatca_payment_means_code FROM payment_methods WHERE id = 'cash'")
        .get() as any;
      const card = sqlite
        .prepare("SELECT zatca_payment_means_code FROM payment_methods WHERE id = 'card'")
        .get() as any;
      const mada = sqlite
        .prepare("SELECT zatca_payment_means_code FROM payment_methods WHERE id = 'mada'")
        .get() as any;
      expect(cash.zatca_payment_means_code).toBe('10');
      expect(card.zatca_payment_means_code).toBe('48');
      expect(mada.zatca_payment_means_code).toBe('48');
    });

    it('order_payments allows multiple rows per (order_id, method_id)', () => {
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

      // First payment line
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
          VALUES (${orderId}, 'cash', 'Cash', '10', 600, ${now})
        `),
      ).not.toThrow();

      // Second payment for same order + method must succeed (ADR 0006:
      // append-only ledger with corrections — no unique on (order_id, method_id))
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
          VALUES (${orderId}, 'cash', 'Cash', '10', -100, ${now})
        `),
      ).not.toThrow();

      const rows = sqlite
        .prepare('SELECT amount_halalas FROM order_payments WHERE order_id = ? ORDER BY id')
        .all(orderId) as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].amount_halalas).toBe(600);
      expect(rows[1].amount_halalas).toBe(-100);
    });

    it('order_payments allows negative amount_halalas (correction lines)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      const pmCard = sqlite
        .prepare("SELECT id FROM payment_methods WHERE id = 'card'")
        .get() as any;
      expect(pmCard).toBeDefined();

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (502, 'uuid-op-negative', 'dine_in', ${doId}, 'paid', 1000, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Negative amount is a balancing/correction line (ADR 0006) — no CHECK
      // constraint blocks it; SQLite integers are signed.
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
          VALUES (${orderId}, 'card', 'Card', '48', -250, ${now})
        `),
      ).not.toThrow();

      const row = sqlite
        .prepare('SELECT amount_halalas FROM order_payments WHERE order_id = ?')
        .get(orderId) as any;
      expect(row.amount_halalas).toBe(-250);
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
          INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
          VALUES (${orderId}, 'card', 'Card', '48', 500, ${now})
        `),
      ).not.toThrow();

      // FK to non-existent method_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
          VALUES (${orderId}, 'nonexistent', 'Bad', '10', 500, ${now})
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

  describe('orders — document_id', () => {
    it('has document_id column on orders table', () => {
      const info = sqlite.prepare('PRAGMA table_info(orders)').all() as any[];
      const names = info.map((c: any) => c.name);
      expect(names).toContain('document_id');
    });

    it('orders.document_id is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, document_id, created_at, updated_at)
        VALUES (700, 'uuid-doc-id-1', 'dine_in', ${doId}, 'open', 'INV26-0001', ${now}, ${now})
      `);

      // Duplicate document_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, document_id, created_at, updated_at)
          VALUES (701, 'uuid-doc-id-2', 'dine_in', ${doId}, 'open', 'INV26-0001', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('order_refunds has document_id column', () => {
      const info = sqlite.prepare('PRAGMA table_info(order_refunds)').all() as any[];
      const names = info.map((c: any) => c.name);
      expect(names).toContain('document_id');
    });

    it('order_refunds.document_id is unique (nullable unique)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;

      // Create order
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, document_id, created_at, updated_at)
        VALUES (702, 'uuid-ref-doc-1', 'dine_in', ${doId}, 'paid', 'INV26-R1', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Insert refund with document_id
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'REF26-0999', ${now})
      `);

      // Duplicate document_id should fail
      expect(() =>
        sqlite.exec(`
          INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
          VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'REF26-0999', ${now})
        `),
      ).toThrow();
    });

    it('zatca_invoices has document_id column', () => {
      const info = sqlite.prepare('PRAGMA table_info(zatca_invoices)').all() as any[];
      const names = info.map((c: any) => c.name);
      expect(names).toContain('document_id');
    });

    it('zatca_credit_notes has document_id column', () => {
      const info = sqlite.prepare('PRAGMA table_info(zatca_credit_notes)').all() as any[];
      const names = info.map((c: any) => c.name);
      expect(names).toContain('document_id');
    });

    it('zatca_invoices.document_id is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (703, 'uuid-zinv-doc-1', 'dine_in', ${doId}, 'paid', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, 500, 'zinv-doc-uuid-1', 'INV-ZTCA-0001', 'hash1', '', '<xml/>', 'tlv', 'signed', ${now}, ${now})
      `);

      // Duplicate document_id must fail even for a different order/attempt
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
          VALUES (${orderId}, 501, 'zinv-doc-uuid-2', 'INV-ZTCA-0001', 'hash2', '', '<xml/>', 'tlv', 'signed', ${now}, ${now})
        `),
      ).toThrow();
    });

    it('zatca_credit_notes.document_id is unique', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;
      const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, document_id, created_at, updated_at)
        VALUES (704, 'uuid-zcn-doc-1', 'dine_in', ${doId}, 'paid', 'INV26-ZCN', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
        VALUES (${orderId}, ${userId}, 'cash', 'Cash', '10', 1000, 150, 1150, 'REF26-ZCN', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-uuid-zcn', 502, 'zcn-doc-uuid-1', 'CN-ZTCA-0001', 'hash1', '', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
      `);

      // Duplicate document_id must fail even for a different refund/attempt
      expect(() =>
        sqlite.exec(`
          INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
          VALUES (${orderId}, ${refundId}, 'inv-uuid-zcn', 503, 'zcn-doc-uuid-2', 'CN-ZTCA-0001', 'hash2', '', '<xml/>', 'tlv', 'signed', 1150, 150, 'test', ${now}, ${now})
        `),
      ).toThrow();
    });
  });

  describe('order items — Arabic name snapshot', () => {
    it('has item_name_ar column on order_items (nullable)', () => {
      const info = sqlite.prepare('PRAGMA table_info(order_items)').all() as any[];
      const col = info.find((c: any) => c.name === 'item_name_ar');
      expect(col).toBeDefined();
      expect(col.notnull).toBe(0); // nullable
    });

    it('has item_name_ar column on order_refund_items (nullable)', () => {
      const info = sqlite.prepare('PRAGMA table_info(order_refund_items)').all() as any[];
      const col = info.find((c: any) => c.name === 'item_name_ar');
      expect(col).toBeDefined();
      expect(col.notnull).toBe(0); // nullable
    });

    it('order_items insert without item_name_ar still works (historical rows)', () => {
      const now = Math.floor(Date.now() / 1000);
      const doId = (sqlite.prepare('SELECT id FROM day_openings LIMIT 1').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
        VALUES (900, 'uuid-item-name-ar', 'dine_in', ${doId}, 'open', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      expect(() =>
        sqlite.exec(`
          INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
          VALUES (${orderId}, 'Test Item', 1000, 1500, 1, 1000, ${now}, ${now})
        `),
      ).not.toThrow();

      const row = sqlite
        .prepare('SELECT item_name_ar FROM order_items WHERE order_id = ?')
        .get(orderId) as any;
      expect(row.item_name_ar).toBeNull();
    });
  });
});
