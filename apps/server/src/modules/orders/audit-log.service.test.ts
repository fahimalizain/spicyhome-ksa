import { AuditLogService } from './audit-log.service';
import { orderAuditLog } from '@spicyhome/db';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

describe('AuditLogService', () => {
  let db: any;
  let sqlite: any;
  let auditLog: AuditLogService;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no INTEGER NOT NULL,
        uuid TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        table_id INTEGER,
        day_opening_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        subtotal_halalas INTEGER DEFAULT 0 NOT NULL,
        vat_halalas INTEGER DEFAULT 0 NOT NULL,
        total_halalas INTEGER DEFAULT 0 NOT NULL,
        discount_halalas INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
      CREATE TABLE order_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    db = drizzle(sqlite);
    auditLog = new AuditLogService();
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertOrder(id: number, uuidSuffix: string = '1') {
    sqlite
      .prepare(
        `INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, created_at, updated_at)
       VALUES (?, 1, 'uuid-${uuidSuffix}', 'dine_in', 1, 'open', 1000, 1000)`,
      )
      .run(id);
  }

  describe('hash chain', () => {
    it('computes first hash with empty prev_hash', () => {
      insertOrder(1);
      const txn = db;

      const result = auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      expect(result.prevHash).toBe('');

      const entry = txn.select().from(orderAuditLog).where(eq(orderAuditLog.orderId, 1)).get();
      expect(entry!.hash).toBe(result.hash);
      expect(entry!.prevHash).toBe('');
      expect(entry!.hash.length).toBe(64);
    });

    it('chains multiple entries with correct prev_hash', () => {
      insertOrder(1);
      const txn = db;

      const r1 = auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      expect(r1.prevHash).toBe('');

      const r2 = auditLog.createEntry(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);
      expect(r2.prevHash).toBe(r1.hash);

      const r3 = auditLog.createEntry(txn, 1, 1, 'sent_to_kitchen', {}, 1002);
      expect(r3.prevHash).toBe(r2.hash);

      const entries = auditLog.getLogs(txn, 1);
      expect(entries.length).toBe(3);
    });

    it('verifyChain returns valid for a correct chain', () => {
      insertOrder(1);
      const txn = db;

      auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      auditLog.createEntry(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);
      auditLog.createEntry(txn, 1, 1, 'sent_to_kitchen', {}, 1002);

      const entries = auditLog.getLogs(txn, 1);
      const result = auditLog.verifyChain(1, entries);
      expect(result.valid).toBe(true);
    });

    it('verifyChain detects broken prev_hash', () => {
      insertOrder(1);
      const txn = db;

      auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      auditLog.createEntry(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);

      const entries = auditLog.getLogs(txn, 1);
      entries[1].prevHash = 'tampered';
      const result = auditLog.verifyChain(1, entries);
      expect(result.valid).toBe(false);
    });

    it('verifyChain detects tampered hash', () => {
      insertOrder(1);
      const txn = db;

      auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      auditLog.createEntry(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);

      const entries = auditLog.getLogs(txn, 1);
      entries[0].hash = 'tampered';
      const result = auditLog.verifyChain(1, entries);
      expect(result.valid).toBe(false);
    });

    it('hash changes with different payload', () => {
      insertOrder(1);
      const txn = db;

      const r1 = auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      const r2 = auditLog.createEntry(txn, 1, 1, 'created', { type: 'takeaway' }, 1000);
      expect(r1.hash).not.toBe(r2.hash);
    });

    it('isolates chains per order', () => {
      insertOrder(1, 'a');
      insertOrder(2, 'b');
      const txn = db;

      const r1a = auditLog.createEntry(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      const r2a = auditLog.createEntry(txn, 2, 1, 'created', { type: 'takeaway' }, 1000);

      expect(r1a.prevHash).toBe('');
      expect(r2a.prevHash).toBe('');

      const entries1 = auditLog.getLogs(txn, 1);
      const entries2 = auditLog.getLogs(txn, 2);
      expect(entries1.length).toBe(1);
      expect(entries2.length).toBe(1);
    });

    it('getLastHash returns empty string for new order', () => {
      insertOrder(99);
      const txn = db;
      const result = auditLog.createEntry(txn, 99, 1, 'created', {}, 1000);
      expect(result.prevHash).toBe('');
    });

    it('getLastHash returns previous hash for existing entries', () => {
      insertOrder(1);
      const txn = db;
      const r1 = auditLog.createEntry(txn, 1, 1, 'created', {}, 1000);
      const r2 = auditLog.createEntry(txn, 1, 1, 'item_added', {}, 1001);
      expect(r2.prevHash).toBe(r1.hash);
    });
  });
});
