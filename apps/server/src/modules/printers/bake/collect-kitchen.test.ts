/**
 * bake/collect — kitchen format Unit Tests
 *
 * Runs against a real SQLite DB (migrations applied, same pattern as
 * print-documents.test.ts):
 *  - fan-out math: open orders with items x active kitchen printers
 *  - skips empty open orders with notes
 *  - explicit order/printer filters, including hard-fails
 *  - limit (first N by order id ascending)
 *  - kitchen-invalid filters (--refund, --kick-drawer) throw
 *  - buffers come from buildKitchenTicketBuffer (shared helper, no drift)
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { collectPrintJobs, BakeFilterError } from './collect';
import type { PrintDocumentsDb } from '../print-documents';

const NOW = 1_700_000_000;

/** Run a SQL statement and return the last inserted row id. */
function insertId(sqlite: Database.Database, sql: string): number {
  sqlite.exec(sql);
  return (sqlite.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
}

describe('collectPrintJobs — kitchen', () => {
  let sqlite: Database.Database;
  let db: PrintDocumentsDb;

  let orderWithItemsId: number;
  let orderDeliveryId: number;
  let orderFallbackId: number;
  let orderEmptyId: number;
  let orderPaidId: number;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db') as {
      findMigrationsDir: () => string;
      applyMigrations: (db: Database.Database, dir: string) => void;
    };
    applyMigrations(sqlite, findMigrationsDir());

    seedDatabase();
    db = drizzle(sqlite, { schema });
  });

  afterAll(() => {
    sqlite.close();
  });

  function seedDatabase(): void {
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES (1, 'admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${NOW}, ${NOW});
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Ali Kasim', 1, 1, ${NOW}, ${NOW});
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-07-15', 'open', ${NOW}, 1, ${NOW}, ${NOW});
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 'T1', 0, 1, ${NOW}, ${NOW});
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('hungerstation', 'HungerStation', 1, 0, ${NOW}, ${NOW});
    `);

    // Printers: 2 active kitchen (tcp + windows), 1 inactive kitchen, 1 receipt.
    sqlite.exec(`
      INSERT INTO printers (id, name, connection_type, windows_printer_name, ip, port, role, is_active, created_at, updated_at)
      VALUES
        (1, 'Kitchen A', 'tcp', NULL, '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW}),
        (2, 'Kitchen B', 'windows', 'Epson Kitchen B', '', 9100, 'kitchen', 1, ${NOW}, ${NOW}),
        (3, 'Kitchen Inactive', 'tcp', NULL, '192.168.1.53', 9100, 'kitchen', 0, ${NOW}, ${NOW}),
        (4, 'Counter', 'tcp', NULL, '192.168.1.50', 9100, 'receipt', 1, ${NOW}, ${NOW});
    `);

    // Open order with items (dine-in at T1, created by Ali).
    orderWithItemsId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, notes, created_at, updated_at, created_by)
      VALUES (1001, 'u-open-1', 'dine_in', 1, 1, 'open', 10000, 1500, 11500, 'INV26-0001', 'No onions please', ${NOW}, ${NOW}, 1);
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, notes, created_at, updated_at)
      VALUES (${orderWithItemsId}, 'Zinger Burger', 11500, 1500, 2, 23000, 'no onion', ${NOW}, ${NOW});
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, notes, created_at, updated_at)
      VALUES (${orderWithItemsId}, 'Pepsi', 3000, 1500, 1, 3000, NULL, ${NOW}, ${NOW});
    `);

    // Open takeaway order linked to a delivery partner (ADR 0007).
    orderDeliveryId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, delivery_partner_id, delivery_external_ref, created_at, updated_at, created_by)
      VALUES (1002, 'u-open-2', 'takeaway', NULL, 1, 'open', 10000, 1500, 11500, 'INV26-0002', 'hungerstation', 'HS-883129', ${NOW}, ${NOW}, 1);
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderDeliveryId}, 'Corn Soup', 10000, 1500, 1, 10000, ${NOW}, ${NOW});
    `);

    // Open order with NULL document_id (SQL level allows it) — the baker must
    // fall back to `Order-<orderNo>` like the shared helpers.
    orderFallbackId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at, created_by)
      VALUES (1003, 'u-open-3', 'dine_in', 1, 1, 'open', 8000, 1200, 9200, NULL, ${NOW}, ${NOW}, NULL);
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, notes, created_at, updated_at)
      VALUES (${orderFallbackId}, 'Kunafa', 8000, 1500, 1, 8000, 'extra cheese', ${NOW}, ${NOW});
    `);

    // Open order with NO items — must be skipped.
    orderEmptyId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
      VALUES (1004, 'u-open-empty', 'takeaway', NULL, 1, 'open', 0, 0, 0, 'INV26-0004', ${NOW}, ${NOW});
    `,
    );

    // Paid order with items — must be ignored.
    orderPaidId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
      VALUES (1005, 'u-paid', 'dine_in', 1, 1, 'paid', 10000, 1500, 11500, 'INV26-0005', ${NOW}, ${NOW});
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderPaidId}, 'Paid Burger', 11500, 1500, 1, 11500, ${NOW}, ${NOW});
    `);
  }

  // ── Fan-out + skip behavior ────────────────────────────────────────────────

  it('produces one job per (open order with items x active kitchen printer)', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    expect(result.jobs).toHaveLength(6); // 3 orders with items x 2 printers
    expect(result.jobs.every((j) => j.format === 'kitchen')).toBe(true);

    const combos = result.jobs.map((j) => `${j.sourceId}:${j.printer.printerId}`).sort();
    expect(combos).toEqual(
      [
        `${orderWithItemsId}:1`,
        `${orderWithItemsId}:2`,
        `${orderDeliveryId}:1`,
        `${orderDeliveryId}:2`,
        `${orderFallbackId}:1`,
        `${orderFallbackId}:2`,
      ].sort(),
    );
  });

  it('ignores paid orders and inactive / non-kitchen printers', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    const orderIds = new Set(result.jobs.map((j) => j.sourceId));
    const printerIds = new Set(result.jobs.map((j) => j.printer.printerId));
    expect(orderIds.has(orderPaidId)).toBe(false);
    expect(printerIds.has(3)).toBe(false); // inactive kitchen printer
    expect(printerIds.has(4)).toBe(false); // receipt-role printer
    expect(printerIds).toEqual(new Set([1, 2]));
  });

  it('skips open orders without items with a note', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    expect(result.jobs.some((j) => j.sourceId === orderEmptyId)).toBe(false);
    expect(result.notes).toContain(`Order ${orderEmptyId}: skipped (no items)`);
  });

  it('bakes a valid ESC/POS ticket via buildKitchenTicketBuffer', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    const job = result.jobs.find(
      (j) => j.sourceId === orderWithItemsId && j.printer.printerId === 1,
    )!;
    // ESC @ init
    expect(job.buffer[0]).toBe(0x1b);
    expect(job.buffer[1]).toBe(0x40);
    const ascii = job.buffer.toString('ascii');
    const hex = job.buffer.toString('hex');
    expect(job.label).toBe('INV26-0001');
    expect(ascii).toContain('INV26-0001');
    expect(ascii).toContain('Printer: Kitchen A');
    expect(ascii).toContain('TABLE #1');
    expect(ascii).toContain('>>>> Dine-in <<<<');
    expect(ascii).toContain('Created By: Ali Kasim');
    expect(ascii).toContain('NOTES: No onions please');
    // Item names are raster (GS v 0); notes + prices remain ASCII
    expect(hex).toContain('1d7630');
    expect(ascii).toContain('no onion');
    // Target fields match the printers row
    expect(job.printer.printerName).toBe('Kitchen A');
    expect(job.printer.connectionType).toBe('tcp');
    expect(job.printer.ip).toBe('192.168.1.51');
    expect(job.printer.port).toBe(9100);
  });

  it('names each printer station in its own ticket header', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    const a = result.jobs.find(
      (j) => j.sourceId === orderWithItemsId && j.printer.printerId === 1,
    )!;
    const b = result.jobs.find(
      (j) => j.sourceId === orderWithItemsId && j.printer.printerId === 2,
    )!;
    expect(a.buffer.toString('ascii')).toContain('Printer: Kitchen A');
    expect(b.buffer.toString('ascii')).toContain('Printer: Kitchen B');
    expect(a.buffer.equals(b.buffer)).toBe(false);
  });

  it('falls back to Order-<orderNo> label when document_id is missing', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    const job = result.jobs.find((j) => j.sourceId === orderFallbackId)!;
    expect(job.label).toBe(`Order-1003`);
    expect(job.buffer.toString('ascii')).toContain('Order-1003');
  });

  it('resolves delivery partner title and external ref (ADR 0007)', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    const job = result.jobs.find((j) => j.sourceId === orderDeliveryId)!;
    const ascii = job.buffer.toString('ascii');
    expect(ascii).toContain('HungerStation / HS-883129');
    expect(ascii).toContain('>>>> Takeaway <<<<');
  });

  it('carries the Windows queue name on windows targets', () => {
    const result = collectPrintJobs(db, 'kitchen', {});
    const job = result.jobs.find((j) => j.printer.printerId === 2)!;
    expect(job.printer.connectionType).toBe('windows');
    expect(job.printer.windowsPrinterName).toBe('Epson Kitchen B');
  });

  it('returns zero jobs for a DB with no open orders', () => {
    const { createTestDb, findMigrationsDir } = require('@spicyhome/db') as {
      createTestDb: (dir: string) => Database.Database;
      findMigrationsDir: () => string;
    };
    const emptySqlite = createTestDb(findMigrationsDir());
    const edb: PrintDocumentsDb = drizzle(emptySqlite, { schema });
    try {
      const result = collectPrintJobs(edb, 'kitchen', {});
      expect(result.jobs).toEqual([]);
      expect(result.notes).toEqual([]);
    } finally {
      emptySqlite.close();
    }
  });

  // ── orderIds filter ────────────────────────────────────────────────────────

  it('orderIds restricts to the given ids', () => {
    const result = collectPrintJobs(db, 'kitchen', {
      orderIds: [orderWithItemsId, orderFallbackId],
    });
    const orderIds = new Set(result.jobs.map((j) => j.sourceId));
    expect(orderIds).toEqual(new Set([orderWithItemsId, orderFallbackId]));
    expect(result.jobs).toHaveLength(4); // 2 orders x 2 printers
  });

  it('orderIds hard-fails on a missing order', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { orderIds: [999999] })).toThrow(BakeFilterError);
    expect(() => collectPrintJobs(db, 'kitchen', { orderIds: [999999] })).toThrow(
      /Order 999999: not found/,
    );
  });

  it('orderIds hard-fails on a non-open order', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { orderIds: [orderPaidId] })).toThrow(
      /Order \d+: not open \(status 'paid'\)/,
    );
  });

  it('orderIds hard-fails on an order without items', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { orderIds: [orderEmptyId] })).toThrow(
      /Order \d+: has no items/,
    );
  });

  // ── printerIds filter ──────────────────────────────────────────────────────

  it('printerIds restricts targets', () => {
    const result = collectPrintJobs(db, 'kitchen', { printerIds: [1] });
    const printerIds = new Set(result.jobs.map((j) => j.printer.printerId));
    expect(printerIds).toEqual(new Set([1]));
    expect(result.jobs).toHaveLength(3); // 3 orders x 1 printer
  });

  it('printerIds hard-fails on a missing printer', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { printerIds: [999] })).toThrow(
      /Printer 999: not found/,
    );
  });

  it('printerIds hard-fails on an inactive kitchen printer', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { printerIds: [3] })).toThrow(
      /Printer 3: inactive/,
    );
  });

  it('printerIds hard-fails on a non-kitchen printer', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { printerIds: [4] })).toThrow(
      /Printer 4: role 'receipt' is not 'kitchen'/,
    );
  });

  // ── limit ──────────────────────────────────────────────────────────────────

  it('limit takes the first N eligible orders by order id ascending', () => {
    const result = collectPrintJobs(db, 'kitchen', { limit: 2 });
    const orderIds = result.jobs.map((j) => j.sourceId);
    expect(new Set(orderIds)).toEqual(new Set([orderWithItemsId, orderDeliveryId]));
    expect(result.jobs).toHaveLength(4);
  });

  it('limit sorts explicit order ids by id ascending before truncating', () => {
    // Explicit order: fallback (higher id) first, limit 1 → the lower id wins.
    const result = collectPrintJobs(db, 'kitchen', {
      orderIds: [orderFallbackId, orderWithItemsId],
      limit: 1,
    });
    expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([orderWithItemsId]));
  });

  // ── kitchen-invalid filters ────────────────────────────────────────────────

  it('refundIds is invalid for kitchen', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { refundIds: [1] })).toThrow(
      /--refund is not valid for format 'kitchen'/,
    );
  });

  it('kickDrawer is invalid for kitchen', () => {
    expect(() => collectPrintJobs(db, 'kitchen', { kickDrawer: true })).toThrow(
      /--kick-drawer is not valid for format 'kitchen'/,
    );
  });

  it('all is a soft no-op for kitchen', () => {
    const baseline = collectPrintJobs(db, 'kitchen', {});
    const withAll = collectPrintJobs(db, 'kitchen', { all: true });
    expect(withAll.jobs.map((j) => j.buffer)).toEqual(baseline.jobs.map((j) => j.buffer));
    expect(withAll.notes).toContain(
      '--all ignored for kitchen: all eligible open orders are included by default',
    );
  });

  // ── unimplemented formats ──────────────────────────────────────────────────

  it("format 'test' is not implemented yet", () => {
    expect(() => collectPrintJobs(db, 'test', {})).toThrow(`format 'test' is not implemented yet`);
  });
});
