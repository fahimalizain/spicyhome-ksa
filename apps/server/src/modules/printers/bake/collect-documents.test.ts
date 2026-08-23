/**
 * bake/collect — open_order, receipt, credit_note formats Unit Tests
 *
 * Runs against a real SQLite DB (migrations applied, same pattern as
 * collect-kitchen.test.ts):
 *  - open_order: open-with-items fan-out over active receipt printers, paid
 *    orders excluded, item-less open orders skipped with notes, explicit
 *    --order hard-fails, --refund/--kick-drawer rejected
 *  - receipt: paid + printable-ZATCA-QR eligibility, default most-recent-1,
 *    --all widens, --order hard-fails, --kick-drawer reaches the builder
 *  - credit_note: printable-CN-QR eligibility, default most-recent-1,
 *    --refund/--order selection + hard-fails, union when both given
 *  - buffers come from the print-documents helpers (shared, no drift)
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

describe('collectPrintJobs — open_order, receipt, credit_note', () => {
  let sqlite: Database.Database;
  let db: PrintDocumentsDb;
  let icvSeq = 0;

  // open_order fixtures
  let openWithItemsId: number;
  let openNoItemsId: number;
  let openFallbackId: number;

  // receipt fixtures
  let paidNoQrId: number;
  let paidPendingId: number;
  let paidQr1Id: number;
  let paidQr2Id: number;

  // credit_note fixtures
  let orderPendingRefundId: number;
  let refund1Id: number;
  let refund2Id: number;
  let refund3Id: number;
  let refund4Id: number;

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

  function insertOrder(
    status: string,
    documentId: string | null,
    uuid: string,
    orderNo: number,
  ): number {
    return insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at, created_by)
      VALUES (${orderNo}, '${uuid}', 'dine_in', 1, 1, '${status}', 10000, 1500, 11500, ${documentId === null ? 'NULL' : `'${documentId}'`}, ${NOW}, ${NOW}, 1);
    `,
    );
  }

  function insertItem(orderId: number, name: string): void {
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, '${name}', 11500, 1500, 1, 11500, ${NOW}, ${NOW});
    `);
  }

  function insertInvoice(orderId: number, status: string): void {
    icvSeq++;
    sqlite.exec(`
      INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
      VALUES (${orderId}, ${icvSeq}, 'uuid-inv-${icvSeq}', 'DOC-inv-${icvSeq}', 'abcd', 'prevhash', '<xml/>', 'INV_QR_${icvSeq}', '${status}', 1, ${NOW}, ${NOW});
    `);
  }

  function insertRefund(orderId: number, documentId: string | null): number {
    return insertId(
      sqlite,
      `
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Test', ${documentId === null ? 'NULL' : `'${documentId}'`}, ${NOW});
    `,
    );
  }

  function insertRefundItem(refundId: number): void {
    sqlite.exec(`
      INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
      VALUES (${refundId}, 'Refunded Item', 11500, 1500, 1, 11500, ${NOW});
    `);
  }

  function insertCreditNote(refundId: number, orderId: number, status: string): void {
    icvSeq++;
    sqlite.exec(`
      INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
      VALUES (${orderId}, ${refundId}, 'uuid-inv-${icvSeq}', ${icvSeq}, 'uuid-cn-${icvSeq}', 'DOC-cn-${icvSeq}', 'abcd', 'prevhash', '<xml/>', 'CN_QR_${icvSeq}', '${status}', 1, 11500, 1500, 'Test', ${NOW}, ${NOW});
    `);
  }

  function seedDatabase(): void {
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES (1, 'admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${NOW}, ${NOW});
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Ali Kasim', 1, 1, ${NOW}, ${NOW});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${NOW}, ${NOW});
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-07-15', 'open', ${NOW}, 1, ${NOW}, ${NOW});
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 'T1', 0, 1, ${NOW}, ${NOW});
      INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
      INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789003');
      INSERT INTO settings (key, value) VALUES ('seller_name', 'Test Seller');
      INSERT INTO settings (key, value) VALUES ('seller_street', 'Main St');
      INSERT INTO settings (key, value) VALUES ('seller_building', '1234');
      INSERT INTO settings (key, value) VALUES ('seller_city', 'Riyadh');
      INSERT INTO settings (key, value) VALUES ('seller_postal', '12345');
      INSERT INTO settings (key, value) VALUES ('seller_country', 'SA');
    `);

    // Printers: 2 active receipt (tcp + windows), 1 inactive receipt, 1 kitchen.
    sqlite.exec(`
      INSERT INTO printers (id, name, connection_type, windows_printer_name, ip, port, role, is_active, created_at, updated_at)
      VALUES
        (1, 'Counter A', 'tcp', NULL, '192.168.1.50', 9100, 'receipt', 1, ${NOW}, ${NOW}),
        (2, 'Counter B', 'windows', 'Epson Counter B', '', 9100, 'receipt', 1, ${NOW}, ${NOW}),
        (3, 'Counter Inactive', 'tcp', NULL, '192.168.1.52', 9100, 'receipt', 0, ${NOW}, ${NOW}),
        (4, 'Kitchen', 'tcp', NULL, '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW});
    `);

    // Open orders for the open_order format.
    openWithItemsId = insertOrder('open', 'INV26-0001', 'u-open-1', 1001);
    insertItem(openWithItemsId, 'Zinger Burger');
    insertItem(openWithItemsId, 'Pepsi');

    // Open order with NO items — must be skipped.
    openNoItemsId = insertOrder('open', 'INV26-0002', 'u-open-2', 1002);

    // Open order with NULL document_id — label falls back to Order-<orderNo>.
    openFallbackId = insertOrder('open', null, 'u-open-3', 1003);
    insertItem(openFallbackId, 'Kunafa');

    // Paid order with NO zatca_invoices row — never receipt eligible.
    paidNoQrId = insertOrder('paid', 'INV26-0004', 'u-paid-4', 1004);
    insertItem(paidNoQrId, 'Burger');

    // Paid order with a non-printable invoice status — not receipt eligible.
    paidPendingId = insertOrder('paid', 'INV26-0005', 'u-paid-5', 1005);
    insertItem(paidPendingId, 'Burger');
    insertInvoice(paidPendingId, 'pending');

    // Paid orders with a printable invoice QR — receipt eligible.
    paidQr1Id = insertOrder('paid', 'INV26-0006', 'u-paid-6', 1006);
    insertItem(paidQr1Id, 'Burger');
    insertInvoice(paidQr1Id, 'signed');

    paidQr2Id = insertOrder('paid', 'INV26-0007', 'u-paid-7', 1007);
    insertItem(paidQr2Id, 'Burger');
    insertInvoice(paidQr2Id, 'reported');

    // Paid order whose refund only has a pending CN — credit --order hard-fails.
    orderPendingRefundId = insertOrder('paid', 'INV26-0008', 'u-paid-8', 1008);
    insertItem(orderPendingRefundId, 'Burger');

    // Refunds: eligible = printable CN QR (refund1, refund3); ineligible = pending (refund2, refund4).
    refund1Id = insertRefund(paidQr2Id, 'REF26-0001');
    insertRefundItem(refund1Id);
    insertCreditNote(refund1Id, paidQr2Id, 'cleared');

    refund2Id = insertRefund(paidQr2Id, 'REF26-0002');
    insertRefundItem(refund2Id);
    insertCreditNote(refund2Id, paidQr2Id, 'pending');

    // NULL document_id — label falls back to Refund-<id>.
    refund3Id = insertRefund(paidQr1Id, null);
    insertRefundItem(refund3Id);
    insertCreditNote(refund3Id, paidQr1Id, 'signed');

    refund4Id = insertRefund(orderPendingRefundId, 'REF26-0004');
    insertRefundItem(refund4Id);
    insertCreditNote(refund4Id, orderPendingRefundId, 'pending');
  }

  // ── open_order ─────────────────────────────────────────────────────────────

  describe('open_order', () => {
    it('produces one job per (open order with items x active receipt printer)', () => {
      const result = collectPrintJobs(db, 'open_order', {});
      expect(result.jobs).toHaveLength(4); // 2 orders with items x 2 printers
      expect(result.jobs.every((j) => j.format === 'open_order')).toBe(true);

      const combos = result.jobs.map((j) => `${j.sourceId}:${j.printer.printerId}`).sort();
      expect(combos).toEqual(
        [
          `${openWithItemsId}:1`,
          `${openWithItemsId}:2`,
          `${openFallbackId}:1`,
          `${openFallbackId}:2`,
        ].sort(),
      );
    });

    it('excludes paid orders and inactive / non-receipt printers', () => {
      const result = collectPrintJobs(db, 'open_order', {});
      const orderIds = new Set(result.jobs.map((j) => j.sourceId));
      const printerIds = new Set(result.jobs.map((j) => j.printer.printerId));
      expect(orderIds.has(paidNoQrId)).toBe(false);
      expect(orderIds.has(paidQr2Id)).toBe(false);
      expect(printerIds.has(3)).toBe(false); // inactive receipt printer
      expect(printerIds.has(4)).toBe(false); // kitchen-role printer
      expect(printerIds).toEqual(new Set([1, 2]));
    });

    it('skips open orders without items with a note', () => {
      const result = collectPrintJobs(db, 'open_order', {});
      expect(result.jobs.some((j) => j.sourceId === openNoItemsId)).toBe(false);
      expect(result.notes).toContain(`Order ${openNoItemsId}: skipped (no items)`);
    });

    it('bakes a valid open order receipt via buildOpenOrderReceiptBuffer', () => {
      const result = collectPrintJobs(db, 'open_order', {});
      const job = result.jobs.find(
        (j) => j.sourceId === openWithItemsId && j.printer.printerId === 1,
      )!;
      // ESC @ init
      expect(job.buffer[0]).toBe(0x1b);
      expect(job.buffer[1]).toBe(0x40);
      const ascii = job.buffer.toString('ascii');
      expect(job.label).toBe('INV26-0001');
      expect(ascii).toContain('OPEN ORDER RECEIPT');
      expect(ascii).toContain('SpicyHome'); // settings.restaurant_name
      expect(ascii).toContain('NOT A TAX INVOICE');
      // Open order receipts never kick the drawer
      expect(job.buffer.toString('hex')).not.toContain('1b70');
      // Target fields match the printers row
      expect(job.printer.printerName).toBe('Counter A');
      expect(job.printer.connectionType).toBe('tcp');
      expect(job.printer.ip).toBe('192.168.1.50');
      expect(job.printer.port).toBe(9100);
    });

    it('falls back to Order-<orderNo> label when document_id is missing', () => {
      const result = collectPrintJobs(db, 'open_order', {});
      const job = result.jobs.find((j) => j.sourceId === openFallbackId)!;
      expect(job.label).toBe('Order-1003');
      expect(job.buffer.toString('ascii')).not.toContain('Order #:');
    });

    it('carries the Windows queue name on windows targets', () => {
      const result = collectPrintJobs(db, 'open_order', {});
      const job = result.jobs.find((j) => j.printer.printerId === 2)!;
      expect(job.printer.connectionType).toBe('windows');
      expect(job.printer.windowsPrinterName).toBe('Epson Counter B');
    });

    it('orderIds restricts to the given ids', () => {
      const result = collectPrintJobs(db, 'open_order', { orderIds: [openFallbackId] });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([openFallbackId]));
      expect(result.jobs).toHaveLength(2); // 1 order x 2 printers
    });

    it('orderIds hard-fails on a missing order', () => {
      expect(() => collectPrintJobs(db, 'open_order', { orderIds: [999999] })).toThrow(
        BakeFilterError,
      );
      expect(() => collectPrintJobs(db, 'open_order', { orderIds: [999999] })).toThrow(
        /Order 999999: not found/,
      );
    });

    it('orderIds hard-fails on a non-open order', () => {
      expect(() => collectPrintJobs(db, 'open_order', { orderIds: [paidQr2Id] })).toThrow(
        /Order \d+: not open \(status 'paid'\)/,
      );
    });

    it('orderIds hard-fails on an order without items', () => {
      expect(() => collectPrintJobs(db, 'open_order', { orderIds: [openNoItemsId] })).toThrow(
        /Order \d+: has no items/,
      );
    });

    it('limit takes the first N eligible orders by order id ascending', () => {
      const result = collectPrintJobs(db, 'open_order', { limit: 1 });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([openWithItemsId]));
      expect(result.jobs).toHaveLength(2);
    });

    it('printerIds hard-fails on non-receipt / inactive printers', () => {
      expect(() => collectPrintJobs(db, 'open_order', { printerIds: [999] })).toThrow(
        /Printer 999: not found/,
      );
      expect(() => collectPrintJobs(db, 'open_order', { printerIds: [3] })).toThrow(
        /Printer 3: inactive/,
      );
      expect(() => collectPrintJobs(db, 'open_order', { printerIds: [4] })).toThrow(
        /Printer 4: role 'kitchen' is not 'receipt'/,
      );
    });

    it('rejects --refund and --kick-drawer', () => {
      expect(() => collectPrintJobs(db, 'open_order', { refundIds: [1] })).toThrow(
        /--refund is not valid for format 'open_order'/,
      );
      expect(() => collectPrintJobs(db, 'open_order', { kickDrawer: true })).toThrow(
        /--kick-drawer is not valid for format 'open_order'/,
      );
    });

    it('all is a soft no-op for open_order', () => {
      const baseline = collectPrintJobs(db, 'open_order', {});
      const withAll = collectPrintJobs(db, 'open_order', { all: true });
      expect(withAll.jobs.map((j) => j.buffer)).toEqual(baseline.jobs.map((j) => j.buffer));
      expect(withAll.notes).toContain(
        '--all ignored for open_order: all eligible open orders are included by default',
      );
    });
  });

  // ── receipt ────────────────────────────────────────────────────────────────

  describe('receipt', () => {
    it('defaults to the single most recent paid order with a printable QR', () => {
      const result = collectPrintJobs(db, 'receipt', {});
      expect(result.jobs).toHaveLength(2); // 1 order x 2 printers
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([paidQr2Id]));
      expect(result.jobs.every((j) => j.format === 'receipt')).toBe(true);
    });

    it('--all widens to every eligible paid order (id ascending)', () => {
      const result = collectPrintJobs(db, 'receipt', { all: true });
      const orderIds = [...new Set(result.jobs.map((j) => j.sourceId))];
      expect(orderIds).toEqual([paidQr1Id, paidQr2Id]);
      expect(result.jobs).toHaveLength(4); // 2 orders x 2 printers
    });

    it('excludes paid orders without a printable QR', () => {
      const ids = new Set(
        collectPrintJobs(db, 'receipt', { all: true }).jobs.map((j) => j.sourceId),
      );
      expect(ids.has(paidNoQrId)).toBe(false);
      expect(ids.has(paidPendingId)).toBe(false);
    });

    it('bakes a simplified invoice via buildSimplifiedInvoiceBuffer', () => {
      const result = collectPrintJobs(db, 'receipt', {});
      const job = result.jobs.find((j) => j.printer.printerId === 1)!;
      // ESC @ init (no drawer kick by default)
      expect(job.buffer[0]).toBe(0x1b);
      expect(job.buffer[1]).toBe(0x40);
      const ascii = job.buffer.toString('ascii');
      expect(job.label).toBe('INV26-0007');
      expect(ascii).toContain('SIMPLIFIED TAX INVOICE');
      expect(ascii).toContain('INV_QR_'); // printable QR payload from the invoice row
    });

    it('orderIds restricts to the given ids', () => {
      const result = collectPrintJobs(db, 'receipt', { orderIds: [paidQr1Id] });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([paidQr1Id]));
      expect(result.jobs).toHaveLength(2);
    });

    it('orderIds hard-fails on missing / not-paid / no-QR orders', () => {
      expect(() => collectPrintJobs(db, 'receipt', { orderIds: [999999] })).toThrow(
        /Order 999999: not found/,
      );
      expect(() => collectPrintJobs(db, 'receipt', { orderIds: [openWithItemsId] })).toThrow(
        /Order \d+: not paid \(status 'open'\)/,
      );
      expect(() => collectPrintJobs(db, 'receipt', { orderIds: [paidNoQrId] })).toThrow(
        /Order \d+: no printable ZATCA invoice QR/,
      );
    });

    it('limit caps the --all set to the first N by order id ascending', () => {
      const result = collectPrintJobs(db, 'receipt', { all: true, limit: 1 });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([paidQr1Id]));
    });

    it('passes --kick-drawer into buildSimplifiedInvoiceBuffer', () => {
      const plain = collectPrintJobs(db, 'receipt', { orderIds: [paidQr2Id] });
      const kicked = collectPrintJobs(db, 'receipt', {
        orderIds: [paidQr2Id],
        kickDrawer: true,
      });
      const plainHex = plain.jobs[0].buffer.toString('hex');
      const kickedHex = kicked.jobs[0].buffer.toString('hex');
      expect(plainHex).not.toContain('1b70');
      expect(kickedHex).toContain('1b70'); // ESC p drawer kick
      expect(plain.jobs[0].buffer.length).not.toBe(kicked.jobs[0].buffer.length);
    });

    it('refundIds is invalid for receipt', () => {
      expect(() => collectPrintJobs(db, 'receipt', { refundIds: [1] })).toThrow(
        /--refund is not valid for format 'receipt'/,
      );
    });
  });

  // ── credit_note ────────────────────────────────────────────────────────────

  describe('credit_note', () => {
    it('defaults to the single most recent refund with a printable CN QR', () => {
      const result = collectPrintJobs(db, 'credit_note', {});
      expect(result.jobs).toHaveLength(2); // 1 refund x 2 printers
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([refund3Id]));
      expect(result.jobs.every((j) => j.format === 'credit_note')).toBe(true);
    });

    it('--all widens to every eligible refund (id ascending)', () => {
      const result = collectPrintJobs(db, 'credit_note', { all: true });
      const refundIds = [...new Set(result.jobs.map((j) => j.sourceId))];
      expect(refundIds).toEqual([refund1Id, refund3Id]);
      expect(result.jobs).toHaveLength(4); // 2 refunds x 2 printers
    });

    it('excludes refunds without a printable CN QR', () => {
      const ids = new Set(
        collectPrintJobs(db, 'credit_note', { all: true }).jobs.map((j) => j.sourceId),
      );
      expect(ids.has(refund2Id)).toBe(false); // pending CN
      expect(ids.has(refund4Id)).toBe(false); // pending CN
    });

    it('bakes a credit note via buildCreditNoteBuffer', () => {
      const result = collectPrintJobs(db, 'credit_note', { refundIds: [refund1Id] });
      const job = result.jobs.find((j) => j.printer.printerId === 1)!;
      expect(job.buffer[0]).toBe(0x1b);
      expect(job.buffer[1]).toBe(0x40);
      const ascii = job.buffer.toString('ascii');
      expect(ascii).toContain('CREDIT NOTE');
      expect(ascii).toContain('CN_QR_'); // printable CN QR payload
      expect(job.label).toBe('REF26-0001');
    });

    it('labels jobs with the Refund-<id> fallback when document_id is missing', () => {
      const result = collectPrintJobs(db, 'credit_note', {});
      const job = result.jobs.find((j) => j.sourceId === refund3Id)!;
      expect(job.label).toBe(`Refund-${refund3Id}`);
    });

    it('refundIds restricts and hard-fails on missing / non-printable refunds', () => {
      const result = collectPrintJobs(db, 'credit_note', { refundIds: [refund1Id] });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([refund1Id]));
      expect(() => collectPrintJobs(db, 'credit_note', { refundIds: [999999] })).toThrow(
        /Refund 999999: not found/,
      );
      expect(() => collectPrintJobs(db, 'credit_note', { refundIds: [refund2Id] })).toThrow(
        /Refund \d+: no printable ZATCA credit note QR/,
      );
    });

    it('orderIds picks the eligible refunds of those orders', () => {
      const result = collectPrintJobs(db, 'credit_note', { orderIds: [paidQr1Id] });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([refund3Id]));
      const both = collectPrintJobs(db, 'credit_note', {
        orderIds: [paidQr2Id, paidQr1Id],
      });
      expect(new Set(both.jobs.map((j) => j.sourceId))).toEqual(new Set([refund1Id, refund3Id]));
    });

    it('orderIds hard-fails with "not found" for a missing order', () => {
      expect(() => collectPrintJobs(db, 'credit_note', { orderIds: [999999] })).toThrow(
        /Order 999999: not found/,
      );
    });

    it('orderIds hard-fails when an existing order has no printable refund', () => {
      expect(() =>
        collectPrintJobs(db, 'credit_note', { orderIds: [orderPendingRefundId] }),
      ).toThrow(/Order \d+: no refunds with a printable ZATCA credit note QR/);
      expect(() => collectPrintJobs(db, 'credit_note', { orderIds: [openWithItemsId] })).toThrow(
        /Order \d+: no refunds with a printable ZATCA credit note QR/,
      );
    });

    it('unions --refund and --order when both are given', () => {
      const result = collectPrintJobs(db, 'credit_note', {
        refundIds: [refund1Id],
        orderIds: [paidQr1Id],
      });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([refund1Id, refund3Id]));
    });

    it('limit caps the --all set to the first N by refund id ascending', () => {
      const result = collectPrintJobs(db, 'credit_note', { all: true, limit: 1 });
      expect(new Set(result.jobs.map((j) => j.sourceId))).toEqual(new Set([refund1Id]));
    });

    it('passes --kick-drawer into buildCreditNoteBuffer', () => {
      const plain = collectPrintJobs(db, 'credit_note', { refundIds: [refund1Id] });
      const kicked = collectPrintJobs(db, 'credit_note', {
        refundIds: [refund1Id],
        kickDrawer: true,
      });
      const plainHex = plain.jobs[0].buffer.toString('hex');
      const kickedHex = kicked.jobs[0].buffer.toString('hex');
      expect(plainHex).not.toContain('1b70');
      expect(kickedHex).toContain('1b70'); // ESC p drawer kick
      expect(plain.jobs[0].buffer.length).not.toBe(kicked.jobs[0].buffer.length);
    });
  });

  // ── receipt-role empty bakes ───────────────────────────────────────────────

  describe('receipt-role empty bakes', () => {
    it('returns empty jobs with a note when no active receipt printers exist', () => {
      const { createTestDb, findMigrationsDir } = require('@spicyhome/db') as {
        createTestDb: (dir: string) => Database.Database;
        findMigrationsDir: () => string;
      };
      const emptySqlite = createTestDb(findMigrationsDir());
      const edb: PrintDocumentsDb = drizzle(emptySqlite, { schema });
      try {
        for (const format of ['open_order', 'receipt', 'credit_note'] as const) {
          const result = collectPrintJobs(edb, format, {});
          expect(result.jobs).toEqual([]);
          expect(result.notes).toContain('no active receipt printers — no jobs to bake');
        }
      } finally {
        emptySqlite.close();
      }
    });
  });
});
