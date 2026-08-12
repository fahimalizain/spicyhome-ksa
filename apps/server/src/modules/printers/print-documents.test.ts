/**
 * print-documents — Unit Tests
 *
 * Focused tests for the pure "load from DB + build ESC/POS buffer" helpers.
 * Runs against a real SQLite :memory: DB with migrations applied — the same
 * pattern as print-job.service.test.ts, but without the Nest app (the module
 * is Nest-free by design).
 */
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { orderItems } from '@spicyhome/db';
import {
  buildCreditNoteBuffer,
  buildKitchenDeltaTicketBuffer,
  buildKitchenTicketBuffer,
  buildOpenOrderReceiptBuffer,
  buildSimplifiedInvoiceBuffer,
  buildTestTicketBuffer,
  type PrintDocumentPrinter,
  type PrintDocumentsDb,
} from './print-documents';

describe('print-documents', () => {
  let sqlite: Database.Database;
  let db: PrintDocumentsDb;
  let now: number;
  let orderSeq = 0;
  let icvSeq = 0;

  const receiptPrinter: PrintDocumentPrinter = {
    id: 1,
    name: 'Counter',
    ip: '192.168.1.50',
    port: 9100,
    config: '{}',
  };

  const kitchenPrinter: PrintDocumentPrinter = {
    id: 2,
    name: 'Kitchen',
    ip: '192.168.1.51',
    port: 9100,
    config: '{}',
  };

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db');
    const migrationsDir = findMigrationsDir();
    applyMigrations(sqlite, migrationsDir);

    now = Math.floor(Date.now() / 1000);

    // Seed base data
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES (1, 'admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${now}, ${now})
    `);
    sqlite.exec(`
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', '$2a$10$placeholder', 'Admin', 1, 1, ${now}, ${now})
    `);

    // Seed: payment methods (required by order_refunds / order_payments FK)
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now})
    `);

    // Seed: settings (seller block + restaurant display name)
    sqlite.exec(`
      INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
      INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789003');
      INSERT INTO settings (key, value) VALUES ('seller_name', 'Test');
      INSERT INTO settings (key, value) VALUES ('seller_name_ar', 'مطعم الاختبار');
      INSERT INTO settings (key, value) VALUES ('seller_street', 'Main St');
      INSERT INTO settings (key, value) VALUES ('seller_street_ar', 'شارع الاختبار');
      INSERT INTO settings (key, value) VALUES ('seller_building', '1234');
      INSERT INTO settings (key, value) VALUES ('seller_city', 'Riyadh');
      INSERT INTO settings (key, value) VALUES ('seller_city_ar', 'الرياض');
      INSERT INTO settings (key, value) VALUES ('seller_postal', '12345');
      INSERT INTO settings (key, value) VALUES ('seller_country', 'SA');
    `);

    db = drizzle(sqlite, { schema });
  });

  afterAll(async () => {
    sqlite.close();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Paid order with one item (115.00 incl. VAT) + a printable ZATCA invoice row. */
  function createBasicOrder(): number {
    orderSeq++;
    const uuid = `pd-order-uuid-${orderSeq}`;
    const orderNo = 100 + orderSeq;
    const businessDate = `2024-07-${String(15 + orderSeq).padStart(2, '0')}`;
    const documentId = `INV26-TEST-${orderSeq}`;

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('${businessDate}', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO orders (
        order_no, uuid, type, day_opening_id, status,
        subtotal_halalas, vat_halalas, total_halalas,
        document_id, created_at, updated_at, created_by
      ) VALUES (
        ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
        10000, 1500, 11500,
        '${documentId}', ${now}, ${now}, 1
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Test Item', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    return orderId;
  }

  /** Like createBasicOrder but open (unpaid), takeaway, no document_id. */
  function createOpenOrder(): number {
    orderSeq++;
    const uuid = `pd-open-order-uuid-${orderSeq}`;
    const orderNo = 200 + orderSeq;
    const businessDate = `2024-07-${String(15 + orderSeq).padStart(2, '0')}`;

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('${businessDate}', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO orders (
        order_no, uuid, type, day_opening_id, status,
        subtotal_halalas, vat_halalas, total_halalas,
        document_id, created_at, updated_at, created_by
      ) VALUES (
        ${orderNo}, '${uuid}', 'takeaway', ${doId}, 'open',
        10000, 1500, 11500,
        NULL, ${now}, ${now}, 1
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Test Item', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    return orderId;
  }

  /** Refund for an order with one refund item + a printable cleared credit note row. */
  function createRefundForOrder(orderId: number): number {
    const refundDocumentId = `REF26-TEST-${orderSeq}`;
    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Test', '${refundDocumentId}', ${now})
    `);
    const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
      VALUES (${refundId}, 'Test Item', 11500, 1500, 1, 11500, ${now})
    `);

    icvSeq++;
    sqlite.exec(`
      INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
      VALUES (${orderId}, ${refundId}, 'uuid-inv-${orderSeq}', ${icvSeq}, 'uuid-cn-${orderSeq}', 'DOC-cn-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'CN_QR_PAYLOAD', 'cleared', 1, 11500, 1500, 'Test', ${now}, ${now})
    `);

    return refundId;
  }

  // ── buildSimplifiedInvoiceBuffer ─────────────────────────────────────────

  describe('buildSimplifiedInvoiceBuffer', () => {
    it('builds a ZATCA simplified invoice with seller block and printable QR', () => {
      const orderId = createBasicOrder();
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-${orderSeq}', 'DOC-inv-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'SIGNED_QR_PAYLOAD', 'signed', 1, ${now}, ${now})
      `);

      const buf = buildSimplifiedInvoiceBuffer(db, orderId, receiptPrinter);
      expect(buf.length).toBeGreaterThan(0);
      const s = buf.toString('ascii');
      expect(s).toContain('SIMPLIFIED TAX INVOICE');
      expect(s).toContain(`Invoice #: INV26-TEST-${orderSeq}`);
      // Seller fields from settings
      expect(s).toContain('Test'); // seller_name
      expect(s).toContain('Main St 1234'); // seller_street + seller_building
      expect(s).toContain('Riyadh 12345'); // seller_city + seller_postal
      expect(s).toContain('TOTAL (incl. VAT)');
      // QR payload from the printable zatca_invoices row
      expect(s).toContain('SIGNED_QR_PAYLOAD');
    });

    it('uses explicit qrTlvPayload over the DB fallback', () => {
      const orderId = createBasicOrder();
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-${orderSeq}', 'DOC-inv-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'DB_QR_VALUE', 'cleared', 1, ${now}, ${now})
      `);

      const buf = buildSimplifiedInvoiceBuffer(db, orderId, receiptPrinter, {
        qrTlvPayload: 'EXPLICIT_QR_VALUE',
      });
      const s = buf.toString('ascii');
      expect(s).toContain('EXPLICIT_QR_VALUE');
      expect(s).not.toContain('DB_QR_VALUE');
    });

    it('throws when the order does not exist', () => {
      expect(() => buildSimplifiedInvoiceBuffer(db, 999999, receiptPrinter)).toThrow(
        'Order 999999 not found',
      );
    });
  });

  // ── buildOpenOrderReceiptBuffer ──────────────────────────────────────────

  describe('buildOpenOrderReceiptBuffer', () => {
    it('builds a non-ZATCA open order receipt using restaurant_name', () => {
      const orderId = createOpenOrder();

      const buf = buildOpenOrderReceiptBuffer(db, orderId, receiptPrinter);
      expect(buf.length).toBeGreaterThan(0);
      const s = buf.toString('ascii');
      expect(s).toContain('OPEN ORDER RECEIPT');
      expect(s).toContain('Order #:');
      expect(s).toContain('SpicyHome'); // settings.restaurant_name
      expect(s).toContain('NOT A TAX INVOICE');
      // No ZATCA framing, no QR, no drawer kick
      expect(s).not.toContain('SIMPLIFIED TAX INVOICE');
      expect(s).not.toContain('Invoice #');
      expect(s).not.toContain('Amount includes VAT');
      expect(buf.toString('hex')).not.toContain('1d286b'); // no QR
      expect(buf.toString('hex')).not.toContain('1b70'); // no drawer kick
    });

    it('includes paidHalalas from order_payments in the PAID / AMOUNT DUE lines', () => {
      const orderId = createOpenOrder(); // total 115.00
      // Partial payment — 20.00 of 115.00 (ADR 0006: payment before food)
      sqlite.exec(`
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at, created_by)
        VALUES (${orderId}, 'cash', 'Cash', '10', 2000, ${now}, 1)
      `);

      const buf = buildOpenOrderReceiptBuffer(db, orderId, receiptPrinter);
      const s = buf.toString('ascii');
      expect(s).toContain('PAID');
      expect(s).toContain('20.00'); // paid
      expect(s).toContain('95.00'); // AMOUNT DUE = 115.00 − 20.00
    });

    it('throws when the order does not exist', () => {
      expect(() => buildOpenOrderReceiptBuffer(db, 999999, receiptPrinter)).toThrow(
        'Order 999999 not found',
      );
    });
  });

  // ── buildCreditNoteBuffer ────────────────────────────────────────────────

  describe('buildCreditNoteBuffer', () => {
    it('builds a credit note with printable CN QR', () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      const buf = buildCreditNoteBuffer(db, refundId, receiptPrinter);
      expect(buf.length).toBeGreaterThan(0);
      const s = buf.toString('ascii');
      expect(s).toContain('CREDIT NOTE');
      expect(s).toContain(`Invoice #: REF26-TEST-${orderSeq}`);
      expect(s).toContain(`Original Invoice: INV26-TEST-${orderSeq}`);
      expect(s).toContain('Reason: Test');
      expect(s).toContain('CN_QR_PAYLOAD');
    });

    it('throws when the refund does not exist', () => {
      expect(() => buildCreditNoteBuffer(db, 999999, receiptPrinter)).toThrow(
        'Refund 999999 not found',
      );
    });
  });

  // ── buildKitchenTicketBuffer ─────────────────────────────────────────────

  describe('buildKitchenTicketBuffer', () => {
    it('builds a non-empty full ticket with document id and item name bytes', () => {
      const orderId = createBasicOrder();

      const buf = buildKitchenTicketBuffer(db, orderId, kitchenPrinter);
      expect(buf.length).toBeGreaterThan(0);
      // Header document id is ASCII text
      expect(buf.toString('ascii')).toContain(`INV26-TEST-${orderSeq}`);
      // Item name lines are raster (GS v 0)
      expect(buf.toString('hex')).toContain('1d7630');
    });

    it('returns a buffer even when the order has no items', () => {
      const orderId = createBasicOrder();
      sqlite.exec(`DELETE FROM order_items WHERE order_id = ${orderId}`);

      const buf = buildKitchenTicketBuffer(db, orderId, kitchenPrinter);
      expect(buf.length).toBeGreaterThan(0);
    });

    it('filters items by orderItemIds when provided', () => {
      const orderId = createBasicOrder(); // item 1: Test Item 115.00
      sqlite.exec(`
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (${orderId}, 'Pepsi', 5750, 1500, 1, 5750, ${now}, ${now})
      `);
      sqlite.exec(`
        UPDATE orders SET subtotal_halalas = 15000, vat_halalas = 2250, total_halalas = 17250 WHERE id = ${orderId}
      `);
      const oiRows = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
      const pepsiId = oiRows.find((r) => r.itemName === 'Pepsi')!.id;

      const buf = buildKitchenTicketBuffer(db, orderId, kitchenPrinter, {
        orderItemIds: [pepsiId],
      });
      const s = buf.toString('ascii');
      expect(s).toContain('57.50'); // Pepsi line total
      expect(s).not.toContain('115.00'); // Test Item line total excluded
    });

    it('throws when the order does not exist', () => {
      expect(() => buildKitchenTicketBuffer(db, 999999, kitchenPrinter)).toThrow(
        'Order 999999 not found',
      );
    });
  });

  // ── buildKitchenDeltaTicketBuffer ────────────────────────────────────────

  describe('buildKitchenDeltaTicketBuffer', () => {
    it('uses the delta printedQty for the line total', () => {
      const orderId = createOpenOrder(); // item unit price 115.00

      const oi = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).get();
      expect(oi).toBeDefined();

      const buf = buildKitchenDeltaTicketBuffer(db, orderId, kitchenPrinter, [
        { orderItemId: oi!.id, printedQty: 2, itemName: 'Test Item' },
      ]);
      expect(buf.length).toBeGreaterThan(0);
      // Line total = unit × printedQty = 115.00 × 2
      expect(buf.toString('ascii')).toContain('230.00');
    });

    it('throws when the order does not exist', () => {
      expect(() =>
        buildKitchenDeltaTicketBuffer(db, 999999, kitchenPrinter, [
          { orderItemId: 1, printedQty: 1, itemName: 'Test Item' },
        ]),
      ).toThrow('Order 999999 not found');
    });
  });

  // ── buildTestTicketBuffer ────────────────────────────────────────────────

  describe('buildTestTicketBuffer', () => {
    it('builds a non-empty diagnostic ticket naming the printer', () => {
      const buf = buildTestTicketBuffer(receiptPrinter);
      expect(buf.length).toBeGreaterThan(0);
      const s = buf.toString('ascii');
      expect(s).toContain('PRINT DIAGNOSTIC');
      expect(s).toContain('Printer: Counter');
      expect(s).toContain('IP: 192.168.1.50:9100');
    });
  });
});
