import Database from 'better-sqlite3';
import { createTestDb, findMigrationsDir } from './migrate';

describe('order_audit_log immutability trigger', () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    const migrationsDir = findMigrationsDir();
    sqlite = createTestDb(migrationsDir);
  });

  afterAll(() => {
    sqlite.close();
  });

  it('blocks UPDATE on order_audit_log', () => {
    const now = Math.floor(Date.now() / 1000);

    // Set up dependencies: user_roles, users, day_openings, orders
    sqlite.exec(`
      INSERT INTO user_roles (name, created_at, updated_at)
      VALUES ('audit_test_role', ${now}, ${now})
    `);
    const roleId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO users (username, pin_hash, name, role_id, created_at, updated_at)
      VALUES ('audit_user', 'hash', 'Audit Tester', ${roleId}, ${now}, ${now})
    `);
    const userId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-08-01', 'open', ${now}, ${userId}, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, created_at, updated_at)
      VALUES (1, 'uuid-audit', 'dine_in', ${doId}, 'open', ${now}, ${now})
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // Insert an audit log row
    sqlite.exec(`
      INSERT INTO order_audit_log (order_id, user_id, action, payload, prev_hash, hash, created_at)
      VALUES (${orderId}, ${userId}, 'created', '{}', '', 'abc123', ${now})
    `);
    const logId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // Attempt UPDATE — should throw due to trigger
    expect(() =>
      sqlite.exec(`UPDATE order_audit_log SET action = 'paid' WHERE id = ${logId}`),
    ).toThrow();
  });

  it('blocks DELETE on order_audit_log', () => {
    // Insert another row
    const now = Math.floor(Date.now() / 1000);
    const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;
    const orderId = (sqlite.prepare('SELECT id FROM orders LIMIT 1').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_audit_log (order_id, user_id, action, payload, prev_hash, hash, created_at)
      VALUES (${orderId}, ${userId}, 'item_added', '{}', 'def456', 'ghi789', ${now})
    `);
    const logId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    expect(() => sqlite.exec(`DELETE FROM order_audit_log WHERE id = ${logId}`)).toThrow();
  });

  it('allows INSERT on order_audit_log', () => {
    const now = Math.floor(Date.now() / 1000);
    const userId = (sqlite.prepare('SELECT id FROM users LIMIT 1').get() as any).id;
    const orderId = (sqlite.prepare('SELECT id FROM orders LIMIT 1').get() as any).id;

    expect(() =>
      sqlite.exec(`
        INSERT INTO order_audit_log (order_id, user_id, action, payload, prev_hash, hash, created_at)
        VALUES (${orderId}, ${userId}, 'sent_to_kitchen', '{}', 'jkl012', 'mno345', ${now})
      `),
    ).not.toThrow();
  });
});
