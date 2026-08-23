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
  buildXReportBuffer,
  buildZReportBuffer,
  type PrintDocumentPrinter,
  type PrintDocumentsDb,
} from './print-documents';
import { encodeUtf8, shapeArabic } from './arabic-encode';

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
      INSERT INTO settings (key, value) VALUES ('seller_district', 'Al Olaya');
      INSERT INTO settings (key, value) VALUES ('seller_district_ar', 'العليا');
      INSERT INTO settings (key, value) VALUES ('seller_postal', '12345');
      INSERT INTO settings (key, value) VALUES ('seller_country', 'SA');
    `);

    db = drizzle(sqlite, { schema });
  });

  afterAll(async () => {
    sqlite.close();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function findSequence(buf: Buffer, seq: number[]): boolean {
    const bufArray = Array.from(buf);
    for (let i = 0; i <= bufArray.length - seq.length; i++) {
      if (seq.every((b, j) => bufArray[i + j] === b)) {
        return true;
      }
    }
    return false;
  }

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
      expect(s).toContain('1234 Main St'); // seller_building + seller_street
      expect(s).toContain('Al Olaya, Riyadh'); // seller_district + seller_city on one line
      expect(s).toContain('Riyadh'); // seller_city
      expect(s).toContain('Kingdom of Saudi'); // country EN (same line as AR)
      // Postal must not appear as its own address token (VAT may contain "12345")
      expect(s.split('\n').some((l) => l.includes('Riyadh') && l.includes('12345'))).toBe(false);
      // Arabic country name bytes present (UTF-8 charset default)
      expect(
        findSequence(
          buf,
          encodeUtf8(
            shapeArabic(
              '\u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629',
            ),
          ),
        ),
      ).toBe(true);
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
      expect(s).not.toContain('Order #:');
      expect(s).toContain('SpicyHome'); // settings.restaurant_name
      expect(s).toContain('NOT A TAX INVOICE');
      expect(s).toContain('Home Delivery');
      expect(s).toContain('0112357926 | 0533243439');
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

  // ── buildXReportBuffer / buildZReportBuffer ───────────────────────────────

  describe('buildXReportBuffer / buildZReportBuffer', () => {
    function seedReportDay(status: 'open' | 'closed'): number {
      sqlite.exec(`
        INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
        SELECT 'hungerstation', 'HungerStation', 1, 3, '30', ${now}, ${now}
        WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = 'hungerstation');
        INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
        SELECT 'keeta', 'Keeta', 1, 4, '30', ${now}, ${now}
        WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = 'keeta');
      `);

      sqlite.exec(`
        INSERT INTO day_openings (
          business_date, status, opening_cash_halalas, opened_at, opened_by,
          closed_at, closed_by, closing_cash_halalas, created_at, updated_at
        ) VALUES (
          '2026-08-22', '${status}', 50000, ${now}, 1,
          ${status === 'closed' ? now : 'NULL'},
          ${status === 'closed' ? '1' : 'NULL'},
          ${status === 'closed' ? '52300' : 'NULL'},
          ${now}, ${now}
        )
      `);
      const dayId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 'xz-cash-${dayId}', 'dine_in', ${dayId}, 'paid', 2000, 300, 2300, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (last_insert_rowid(), 'cash', 'Cash', '10', 2300, ${now});
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (2, 'xz-hs-${dayId}', 'takeaway', ${dayId}, 'paid', 2000, 300, 2300, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (last_insert_rowid(), 'hungerstation', 'HungerStation', '30', 2300, ${now});
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (3, 'xz-kt-${dayId}', 'takeaway', ${dayId}, 'paid', 4000, 600, 4600, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (last_insert_rowid(), 'keeta', 'Keeta', '30', 4600, ${now});
      `);
      return dayId;
    }

    it('builds an X-report for an open day (no closing cash)', () => {
      const dayId = seedReportDay('open');
      const buf = buildXReportBuffer(db, dayId);
      const text = buf.toString('ascii');
      expect(text).toContain('X-REPORT');
      expect(text).toContain('2026-08-22');
      expect(text).toContain('Opening Cash');
      expect(text).not.toContain('Closing Cash');
      expect(text).toContain('SALES BY PAYMENT METHOD');
      expect(text).toContain('Cash');
      expect(text).toContain('HungerStation');
      expect(text).toContain('Keeta');
      expect(text).toContain('23.00');
      expect(text).toContain('46.00');
    });

    it('builds a Z-report for a closed day (closing + expected)', () => {
      const dayId = seedReportDay('closed');
      const buf = buildZReportBuffer(db, dayId);
      const text = buf.toString('ascii');
      expect(text).toContain('Z-REPORT');
      expect(text).toContain('Closing Cash');
      expect(text).toContain('Expected');
      expect(text).toContain('523.00');
      expect(text).toContain('SALES BY PAYMENT METHOD');
      expect(text).toContain('Cash');
      expect(text).toContain('HungerStation');
      expect(text).toContain('Keeta');
    });

    it('rolls paid items up to top-level categories above SALES', () => {
      const dayId = seedReportDay('closed');
      sqlite.exec(`
        INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
        VALUES
          (201, 'Breads', 0, 1, ${now}, ${now}),
          (202, 'Starters', 1, 1, ${now}, ${now}),
          (203, 'Mains', 2, 1, ${now}, ${now});
        INSERT INTO item_subcategories (id, category_id, name, sort_order, is_active, created_at, updated_at)
        VALUES
          (201, 201, 'Naan', 0, 1, ${now}, ${now}),
          (202, 201, 'Roti', 1, 1, ${now}, ${now}),
          (203, 202, 'Veg', 0, 1, ${now}, ${now});
        INSERT INTO items (id, category_id, subcategory_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
        VALUES
          (201, 201, 201, 'Garlic Naan', 1150, 1500, 0, 1, ${now}, ${now}),
          (202, 201, 202, 'Roti', 500, 1500, 1, 1, ${now}, ${now}),
          (203, 202, 203, 'Samosa', 800, 1500, 0, 1, ${now}, ${now});
      `);
      const paidOrderId = (
        sqlite
          .prepare(`SELECT id FROM orders WHERE day_opening_id = ? AND status = 'paid' LIMIT 1`)
          .get(dayId) as { id: number }
      ).id;
      sqlite.exec(`
        INSERT INTO order_items (order_id, item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES
          (${paidOrderId}, 201, 'Garlic Naan', 1150, 1500, 4, 4600, ${now}, ${now}),
          (${paidOrderId}, 202, 'Roti', 500, 1500, 8, 4000, ${now}, ${now}),
          (${paidOrderId}, 203, 'Samosa', 800, 1500, 5, 4000, ${now}, ${now});
      `);

      const text = buildZReportBuffer(db, dayId).toString('ascii');
      expect(text).toContain('SALES BY CATEGORY');
      expect(text).toContain('Breads');
      expect(text).toContain('x12');
      expect(text).toContain('86.00');
      expect(text).toContain('Starters');
      expect(text).toContain('x5');
      expect(text).toContain('40.00');
      expect(text).not.toContain('Mains');
      expect(text).not.toContain('Naan');
      expect(text).not.toContain('Roti');
      expect(text.indexOf('SALES BY CATEGORY')).toBeLessThan(text.indexOf('Total Sales'));
      expect(text.indexOf('Breads')).toBeLessThan(text.indexOf('Starters'));
      expect(text).not.toContain('CANCELLATIONS AFTER KITCHEN PRINT');
    });

    it('prints kitchen cancellations after category sales', () => {
      const dayId = seedReportDay('closed');
      sqlite.exec(`
        INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
        VALUES (301, 'Breads', 0, 1, ${now}, ${now});
        INSERT INTO item_subcategories (id, category_id, name, sort_order, is_active, created_at, updated_at)
        VALUES (301, 301, 'Naan', 0, 1, ${now}, ${now});
        INSERT INTO items (id, category_id, subcategory_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
        VALUES (301, 301, 301, 'Butter Naan', 500, 1500, 0, 1, ${now}, ${now});
      `);
      const paidOrderId = (
        sqlite
          .prepare(`SELECT id FROM orders WHERE day_opening_id = ? AND status = 'paid' LIMIT 1`)
          .get(dayId) as { id: number }
      ).id;
      sqlite.exec(`
        INSERT INTO order_events (order_id, event_idx, user_id, type, payload, prev_hash, hash, created_at)
        VALUES
          (${paidOrderId}, 1, 1, 'item_added',
            '{"orderItemId":401,"itemId":301,"qty":5,"unitPriceHalalas":500,"kitchenPrintedQty":0}',
            '', 'h1', ${now}),
          (${paidOrderId}, 2, 1, 'kitchen_print_enqueued',
            '{"items":[{"orderItemId":401,"itemName":"Butter Naan","printedQty":5}]}',
            'h1', 'h2', ${now}),
          (${paidOrderId}, 3, 1, 'item_removed',
            '{"orderItemId":401,"itemName":"Butter Naan","oldQty":5,"oldTotal":2500}',
            'h2', 'h3', ${now});
      `);

      const text = buildZReportBuffer(db, dayId).toString('ascii');
      expect(text).toContain('CANCELLATIONS AFTER KITCHEN PRINT');
      expect(text).toContain('Breads');
      expect(text).toContain('x5');
      expect(text).toContain('25.00');
      expect(text.indexOf('CANCELLATIONS AFTER KITCHEN PRINT')).toBeGreaterThan(
        text.indexOf('SALES BY CATEGORY') === -1 ? 0 : text.indexOf('SALES BY CATEGORY'),
      );
      expect(text.indexOf('CANCELLATIONS AFTER KITCHEN PRINT')).toBeLessThan(
        text.indexOf('Total Sales'),
      );
    });

    it('lists only methods with payments, ordered by catalog sort_order', () => {
      const dayId = seedReportDay('closed');
      sqlite.exec(`
        INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
        SELECT 'card', 'Card', 1, 1, '48', ${now}, ${now}
        WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = 'card');
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (4, 'xz-card-${dayId}', 'dine_in', ${dayId}, 'paid', 1000, 150, 1150, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (last_insert_rowid(), 'card', 'Card', '48', 1150, ${now});
      `);

      const text = buildZReportBuffer(db, dayId).toString('ascii');
      const section = text.indexOf('SALES BY PAYMENT METHOD');
      expect(section).toBeGreaterThan(-1);
      expect(text).not.toContain('mada');
      expect(text.indexOf('Cash', section)).toBeLessThan(text.indexOf('Card', section));
      expect(text.indexOf('Card', section)).toBeLessThan(text.indexOf('HungerStation', section));
      expect(text.indexOf('HungerStation', section)).toBeLessThan(text.indexOf('Keeta', section));
    });

    it('throws when the day does not exist', () => {
      expect(() => buildZReportBuffer(db, 999999)).toThrow('Business day 999999 not found');
      expect(() => buildXReportBuffer(db, 999999)).toThrow('Business day 999999 not found');
    });
  });
});
