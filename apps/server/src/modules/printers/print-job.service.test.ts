/**
 * PrintJobService — Unit Tests
 *
 * Tests the receipt printing paths with focus on QR TLV fallback
 * from cleared zatca_invoices and zatca_credit_notes rows.
 */
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { DatabaseModule } from '../database/database.module';
import { PrintersModule } from './printers.module';
import { PrintersService } from './printers.service';
import { PrintJobService } from './print-job.service';
import { FakePrinterTransport } from './printer-transport';
import { DRIZZLE } from '../database/database.module';
import { encodePc864, encodeUtf8, shapeArabic } from './arabic-encode';

describe('PrintJobService', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let printJobService: PrintJobService;
  let printersService: PrintersService;
  let transport: FakePrinterTransport;
  let now: number;
  let orderSeq = 0;
  let icvSeq = 0;

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

    // Seed: receipt printer
    sqlite.exec(`
      INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
      VALUES (1, 'Counter', '192.168.1.50', 9100, 'receipt', 1, ${now}, ${now})
    `);

    // Seed: kitchen printers (fan-out targets for kitchen tickets)
    sqlite.exec(`
      INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
      VALUES (2, 'Kitchen', '192.168.1.51', 9100, 'kitchen', 1, ${now}, ${now})
    `);
    sqlite.exec(`
      INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
      VALUES (3, 'Cold Station', '192.168.1.52', 9100, 'kitchen', 1, ${now}, ${now})
    `);

    // Seed: settings
    sqlite.exec(`
      INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
      INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789003');
      INSERT INTO settings (key, value) VALUES ('seller_name', 'Test');
      INSERT INTO settings (key, value) VALUES ('seller_street', 'Main St');
      INSERT INTO settings (key, value) VALUES ('seller_building', '1234');
      INSERT INTO settings (key, value) VALUES ('seller_city', 'Riyadh');
      INSERT INTO settings (key, value) VALUES ('seller_postal', '12345');
      INSERT INTO settings (key, value) VALUES ('seller_country', 'SA');
      INSERT INTO settings (key, value) VALUES ('zatca_org_unit', 'TestOrg');
    `);

    // Seed: payment methods (required by order_refunds FK)
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now})
    `);

    db = drizzle(sqlite, { schema });

    const moduleFixture = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), DatabaseModule, PrintersModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    printJobService = app.get(PrintJobService);
    printersService = app.get(PrintersService);

    transport = new FakePrinterTransport();
    printersService.setTransport(transport);
  });

  afterAll(async () => {
    sqlite.close();
  });

  beforeEach(() => {
    transport.sent = [];
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function createBasicOrder(): number {
    orderSeq++;
    const uuid = `test-order-uuid-${orderSeq}`;
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
        document_id, created_at, updated_at
      ) VALUES (
        ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
        10000, 1500, 11500,
        '${documentId}', ${now}, ${now}
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Test Item', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    return orderId;
  }

  /** Like createBasicOrder but with an open (unpaid) order — for open receipts. */
  function createOpenOrder(): number {
    orderSeq++;
    const uuid = `test-open-order-uuid-${orderSeq}`;
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
        document_id, created_at, updated_at
      ) VALUES (
        ${orderNo}, '${uuid}', 'takeaway', ${doId}, 'open',
        10000, 1500, 11500,
        NULL, ${now}, ${now}
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Test Item', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    return orderId;
  }

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

    return refundId;
  }

  function findSequence(buf: Buffer, seq: number[]): boolean {
    const bufArray = Array.from(buf);
    for (let i = 0; i <= bufArray.length - seq.length; i++) {
      if (seq.every((b, j) => bufArray[i + j] === b)) {
        return true;
      }
    }
    return false;
  }

  /**
   * ASCII text with ESC/POS command bytes stripped, so column lines start at
   * their label (the bold-on ESC E prefix of AMOUNT DUE is removed).
   */
  function plainText(buf: Buffer): string {
    const bytes = Array.from(buf);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0x1b) {
        // ESC command: ESC @ has 1 parameter byte; ESC n x has 2.
        i += bytes[i + 1] === 0x40 ? 1 : 2;
        continue;
      }
      if (b === 0x1d) {
        // GS command (partial cut here: GS V B n = 4 bytes total).
        i += 3;
        continue;
      }
      out += String.fromCharCode(b);
    }
    return out;
  }

  // ── printReceipt — QR fallback from zatca_invoices ─────────────────────

  describe('printReceipt', () => {
    it('renders ZATCA-compliant receipt content (title, documentId, seller, totals)', async () => {
      const orderId = createBasicOrder();
      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const s = transport.sent[0].data.toString('ascii');
      expect(s).toContain('SIMPLIFIED TAX INVOICE');
      expect(s).toContain(`Invoice #: INV26-TEST-${orderSeq}`);
      // seller fields from settings
      expect(s).toContain('Test'); // seller_name
      expect(s).toContain('Main St 1234'); // seller_street + seller_building
      expect(s).toContain('Riyadh 12345'); // seller_city + seller_postal
      expect(s).toContain('SA'); // seller_country
      expect(s).toContain('Amount includes VAT');
      expect(s).toContain('TOTAL (incl. VAT)');
      expect(s).toContain('SAR');
    });

    it('encodes item_name_ar when receipt printer has Arabic encoding configured', async () => {
      // Configure the receipt printer with PC864 Arabic
      sqlite.exec(`
        UPDATE printers SET config = '{"arabic":{"encoding":"pc864","codePage":22,"visualRtl":false}}' WHERE id = 1
      `);
      try {
        const orderId = createBasicOrder();
        // Snapshot an Arabic name on the order item (بند اختبار)
        const itemNameAr = '\u0628\u0646\u062F \u0627\u062E\u062A\u0628\u0627\u0631';
        sqlite.exec(`
          UPDATE order_items SET item_name_ar = '${itemNameAr}' WHERE order_id = ${orderId}
        `);

        await printJobService.printReceipt(orderId);

        expect(transport.sent.length).toBe(1);
        const buf = transport.sent[0].data;
        expect(findSequence(buf, encodePc864(`1x ${itemNameAr}`))).toBe(true);
        expect(buf.toString('hex')).toContain('1b7416'); // ESC t 22 (PC864)
      } finally {
        sqlite.exec(`UPDATE printers SET config = '{}' WHERE id = 1`);
      }
    });

    it('falls back to items.name_ar from menu catalog when snapshot is missing', async () => {
      const orderId = createBasicOrder();
      // Seed a menu item WITH an Arabic name, link the order item, snapshot NULL
      sqlite.exec(`
        INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
        VALUES (101, 'Test Category', 0, 1, ${now}, ${now})
      `);
      sqlite.exec(`
        INSERT INTO items (id, category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
        VALUES (101, 101, 'Burger', '${'برجر طازج'}', 11500, 1500, 0, 1, ${now}, ${now})
      `);
      sqlite.exec(`
        UPDATE order_items SET item_id = 101, item_name_ar = NULL WHERE order_id = ${orderId}
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(
        findSequence(
          buf,
          encodeUtf8(shapeArabic('1x \u0628\u0631\u062C\u0631 \u0637\u0627\u0632\u062C')),
        ),
      ).toBe(true);
    });

    it('includes QR from a cleared zatca_invoices row when no explicit qrTlvPayload is provided', async () => {
      const orderId = createBasicOrder();

      // Create a cleared invoice row with QR TLV
      icvSeq++;
      const tlvPayload = 'QVJDVEVTVFRMVg=='; // base64 example
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-${orderSeq}', 'DOC-' || 'uuid-inv-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'cleared', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // The QR TLV payload should appear in the buffer
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    it('does NOT include QR from a non-cleared (rejected) zatca_invoices row', async () => {
      const orderId = createBasicOrder();

      // Create a rejected invoice row — should NOT be used for QR
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-rej-${orderSeq}', 'DOC-' || 'uuid-inv-rej-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'REJECTED_QR', 'rejected', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // QR print command should NOT be present
      expect(buf.toString('hex')).not.toContain('315130');
    });

    // ── Simplified invoice statuses (all have valid QR) ──────────────────

    it('includes QR from a signed zatca_invoices row (simplified, fresh)', async () => {
      const orderId = createBasicOrder();

      icvSeq++;
      const tlvPayload = 'SIGNED_QR_PAYLOAD';
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-signed-${orderSeq}', 'DOC-' || 'uuid-inv-signed-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'signed', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    it('includes QR from a reported zatca_invoices row (simplified, reporting success)', async () => {
      const orderId = createBasicOrder();

      icvSeq++;
      const tlvPayload = 'REPORTED_QR_PAYLOAD';
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-reported-${orderSeq}', 'DOC-' || 'uuid-inv-reported-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'reported', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    it('includes QR from a failed zatca_invoices row (simplified reporting fail; QR still valid)', async () => {
      const orderId = createBasicOrder();

      icvSeq++;
      const tlvPayload = 'FAILED_QR_PAYLOAD';
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-failed-${orderSeq}', 'DOC-' || 'uuid-inv-failed-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'failed', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    // ── Standard in-flight statuses (must NOT supply QR) ─────────────────

    it('does NOT include QR from a pending zatca_invoices row', async () => {
      const orderId = createBasicOrder();

      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-pending-${orderSeq}', 'DOC-' || 'uuid-inv-pending-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'PENDING_QR', 'pending', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('hex')).not.toContain('315130');
    });

    it('does NOT include QR from an error zatca_invoices row', async () => {
      const orderId = createBasicOrder();

      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-error-${orderSeq}', 'DOC-' || 'uuid-inv-error-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'ERROR_QR', 'error', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('hex')).not.toContain('315130');
    });

    // ── Multi-row scenarios ──────────────────────────────────────────────

    it('uses cleared QR over older rejected row when both exist (multi-row)', async () => {
      const orderId = createBasicOrder();

      // Older rejected row (lower id)
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-rej-old2-${orderSeq}', 'DOC-' || 'uuid-inv-rej-old2-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'REJECTED_QR', 'rejected', 1, ${now}, ${now})
      `);

      // Newer cleared row (higher id)
      icvSeq++;
      const clearedQr = 'CLEARED_QR_PAYLOAD';
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-cleared-new2-${orderSeq}', 'DOC-' || 'uuid-inv-cleared-new2-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${clearedQr}', 'cleared', 2, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('ascii')).toContain(clearedQr);
    });

    it('does NOT include QR when only rejected and error rows exist (no printable status)', async () => {
      const orderId = createBasicOrder();

      // Rejected row
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-rej-xx-${orderSeq}', 'DOC-' || 'uuid-inv-rej-xx-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'REJ_QR', 'rejected', 1, ${now}, ${now})
      `);

      // Error row
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-err-xx-${orderSeq}', 'DOC-' || 'uuid-inv-err-xx-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'ERR_QR', 'error', 1, ${now}, ${now})
      `);

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('hex')).not.toContain('315130');
    });

    it('uses explicit qrTlvPayload over DB fallback', async () => {
      const orderId = createBasicOrder();

      // Create a cleared invoice row with some QR (will be overridden)
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, created_at, updated_at)
        VALUES (${orderId}, ${icvSeq}, 'uuid-inv-${orderSeq}', 'DOC-' || 'uuid-inv-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'DB_QR_VALUE', 'cleared', 1, ${now}, ${now})
      `);

      const explicitPayload = 'EXPLICIT_QR_VALUE';
      await printJobService.printReceipt(orderId, { qrTlvPayload: explicitPayload });

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // The explicit value should be in the buffer
      expect(buf.toString('ascii')).toContain(explicitPayload);
      // The DB value should NOT be in the buffer
      expect(buf.toString('ascii')).not.toContain('DB_QR_VALUE');
    });

    it('does NOT include QR when no cleared invoice exists (no QR fallback)', async () => {
      const orderId = createBasicOrder();

      await printJobService.printReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // QR print command should NOT be present
      expect(buf.toString('hex')).not.toContain('315130');
    });
  });

  // ── printOpenOrderReceipt — non-ZATCA open order slip ──────────────────

  describe('printOpenOrderReceipt', () => {
    it('builds a non-ZATCA open order receipt buffer', async () => {
      const orderId = createOpenOrder();
      await printJobService.printOpenOrderReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      const s = buf.toString('ascii');
      expect(s).toContain('OPEN ORDER RECEIPT');
      expect(s).toContain('Order #:');
      expect(s).toContain('TOTAL (incl. VAT)');
      expect(s).toContain('AMOUNT DUE');
      expect(s).toContain('NOT A TAX INVOICE');
      expect(s).toContain('Please collect your Simplified Tax Invoice');

      // No ZATCA framing
      expect(s).not.toContain('SIMPLIFIED TAX INVOICE');
      expect(s).not.toContain('CREDIT NOTE');
      expect(s).not.toContain('Invoice #');
      expect(s).not.toContain('Amount includes VAT');

      // No QR, no drawer kick
      expect(buf.toString('hex')).not.toContain('1d286b');
      expect(buf.toString('hex')).not.toContain('1b70');
    });

    it('uses restaurant_name for the display name (never the ZATCA seller name)', async () => {
      // Distinctive seller_name so it cannot collide with item names.
      sqlite.exec(`UPDATE settings SET value = 'SellerXYZ' WHERE key = 'seller_name'`);
      try {
        const orderId = createOpenOrder();
        await printJobService.printOpenOrderReceipt(orderId);

        expect(transport.sent.length).toBe(1);
        const s = transport.sent[0].data.toString('ascii');
        expect(s).toContain('SpicyHome'); // settings.restaurant_name
        expect(s).not.toContain('SellerXYZ'); // settings.seller_name must NOT be used
        expect(s).not.toContain('Main St 1234'); // seller address must NOT be used
        expect(s).not.toContain('300123456789003'); // settings.vat_number must NOT be used
      } finally {
        sqlite.exec(`UPDATE settings SET value = 'Test' WHERE key = 'seller_name'`);
      }
    });

    it('throws when the order does not exist', async () => {
      await expect(printJobService.printOpenOrderReceipt(999999)).rejects.toThrow(
        'Order 999999 not found',
      );
      expect(transport.sent.length).toBe(0);
    });

    it('renders AMOUNT DUE equal to the total when no payments exist (no PAID line)', async () => {
      const orderId = createOpenOrder(); // total 115.00
      await printJobService.printOpenOrderReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      const dueLine = plainText(buf)
        .split('\n')
        .find((l) => l.startsWith('AMOUNT DUE'));
      expect(dueLine).toBeDefined();
      expect(dueLine).toContain('115.00');
      const paidLine = plainText(buf)
        .split('\n')
        .find((l) => l.startsWith('PAID'));
      expect(paidLine).toBeUndefined();
    });

    it('shows PAID and reduced AMOUNT DUE when the order has a partial payment', async () => {
      const orderId = createOpenOrder(); // total 115.00
      // Partial payment — 20.00 of 115.00 (ADR 0006: payment before food)
      sqlite.exec(`
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at, created_by)
        VALUES (${orderId}, 'cash', 'Cash', '10', 2000, ${now}, 1)
      `);

      await printJobService.printOpenOrderReceipt(orderId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      const paidLine = plainText(buf)
        .split('\n')
        .find((l) => l.startsWith('PAID'));
      expect(paidLine).toBeDefined();
      expect(paidLine).toContain('20.00');
      const dueLine = plainText(buf)
        .split('\n')
        .find((l) => l.startsWith('AMOUNT DUE'));
      expect(dueLine).toBeDefined();
      expect(dueLine).toContain('95.00'); // 115.00 − 20.00
    });

    it('prints item lines with Arabic snapshot when configured', async () => {
      sqlite.exec(`
        UPDATE printers SET config = '{"arabic":{"encoding":"pc864","codePage":22,"visualRtl":false}}' WHERE id = 1
      `);
      try {
        const orderId = createOpenOrder();
        const itemNameAr = '\u0628\u0646\u062F \u0627\u062E\u062A\u0628\u0627\u0631';
        sqlite.exec(`
          UPDATE order_items SET item_name_ar = '${itemNameAr}' WHERE order_id = ${orderId}
        `);

        await printJobService.printOpenOrderReceipt(orderId);

        expect(transport.sent.length).toBe(1);
        const buf = transport.sent[0].data;
        expect(findSequence(buf, encodePc864(`1x ${itemNameAr}`))).toBe(true);
      } finally {
        sqlite.exec(`UPDATE printers SET config = '{}' WHERE id = 1`);
      }
    });
  });

  // ── printRefundReceipt — QR fallback from zatca_credit_notes ──────────

  describe('printRefundReceipt', () => {
    it('renders credit note content (title, documentId, original invoice, reason)', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      await printJobService.printRefundReceipt(refundId);

      expect(transport.sent.length).toBe(1);
      const s = transport.sent[0].data.toString('ascii');
      expect(s).toContain('CREDIT NOTE');
      expect(s).not.toContain('SIMPLIFIED TAX INVOICE');
      expect(s).toContain(`Invoice #: REF26-TEST-${orderSeq}`);
      expect(s).toContain(`Original Invoice: INV26-TEST-${orderSeq}`);
      expect(s).toContain('Reason: Test');
      expect(s).toContain('Amount includes VAT');
    });

    it('includes QR from a cleared zatca_credit_notes row when no explicit qrTlvPayload is provided', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      // Create a cleared credit note row with QR TLV
      icvSeq++;
      const tlvPayload = 'Q05RUkRFVEVTVFRMVg=='; // base64 example
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'uuid-inv-${orderSeq}', ${icvSeq}, 'uuid-cn-${orderSeq}', 'DOC-' || 'uuid-cn-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'cleared', 1, 11500, 1500, 'Test', ${now}, ${now})
      `);

      await printJobService.printRefundReceipt(refundId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // The QR TLV payload should appear in the buffer
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    it('does NOT include QR when no cleared credit note exists', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      await printJobService.printRefundReceipt(refundId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // QR print command should NOT be present
      expect(buf.toString('hex')).not.toContain('315130');
    });

    it('uses explicit qrTlvPayload over DB fallback', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      // Create a cleared credit note row with some QR (will be overridden)
      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'uuid-inv-${orderSeq}', ${icvSeq}, 'uuid-cn-${orderSeq}', 'DOC-' || 'uuid-cn-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'DB_CN_QR_VALUE', 'cleared', 1, 11500, 1500, 'Test', ${now}, ${now})
      `);

      const explicitPayload = 'EXPLICIT_CN_QR_VALUE';
      await printJobService.printRefundReceipt(refundId, { qrTlvPayload: explicitPayload });

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      // The explicit value should be in the buffer
      expect(buf.toString('ascii')).toContain(explicitPayload);
      // The DB value should NOT be in the buffer
      expect(buf.toString('ascii')).not.toContain('DB_CN_QR_VALUE');
    });

    // ── Simplified credit note statuses ──────────────────────────────────

    it('includes QR from a signed zatca_credit_notes row (simplified)', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      icvSeq++;
      const tlvPayload = 'CN_SIGNED_QR';
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'uuid-inv-${orderSeq}', ${icvSeq}, 'uuid-cn-signed-${orderSeq}', 'DOC-' || 'uuid-cn-signed-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'signed', 1, 11500, 1500, 'Test', ${now}, ${now})
      `);

      await printJobService.printRefundReceipt(refundId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    it('includes QR from a reported zatca_credit_notes row (simplified)', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      icvSeq++;
      const tlvPayload = 'CN_REPORTED_QR';
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'uuid-inv-${orderSeq}', ${icvSeq}, 'uuid-cn-reported-${orderSeq}', 'DOC-' || 'uuid-cn-reported-${orderSeq}', 'abcd', 'prevhash', '<xml/>', '${tlvPayload}', 'reported', 1, 11500, 1500, 'Test', ${now}, ${now})
      `);

      await printJobService.printRefundReceipt(refundId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('ascii')).toContain(tlvPayload);
    });

    it('does NOT include QR from a rejected zatca_credit_notes row', async () => {
      const orderId = createBasicOrder();
      const refundId = createRefundForOrder(orderId);

      icvSeq++;
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, attempt_no, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'uuid-inv-${orderSeq}', ${icvSeq}, 'uuid-cn-rejected-${orderSeq}', 'DOC-' || 'uuid-cn-rejected-${orderSeq}', 'abcd', 'prevhash', '<xml/>', 'CN_REJECTED_QR', 'rejected', 1, 11500, 1500, 'Test', ${now}, ${now})
      `);

      await printJobService.printRefundReceipt(refundId);

      expect(transport.sent.length).toBe(1);
      const buf = transport.sent[0].data;
      expect(buf.toString('hex')).not.toContain('315130');
    });
  });

  // ── printKitchenTickets / printKitchenDeltas — documentId + printer name ──

  describe('printKitchenTickets / printKitchenDeltas', () => {
    it('prints the ZATCA documentId in the header when set (not the order number)', async () => {
      const orderId = createBasicOrder(); // document_id = INV26-TEST-<orderSeq>
      await printJobService.printKitchenTickets(orderId);

      expect(transport.sent.length).toBe(2);
      const str = transport.sent[0].data.toString('ascii');
      expect(str).toContain(`INV26-TEST-${orderSeq}`);
      expect(str).not.toContain('ORDER #');
    });

    it('falls back to Order-<orderNo> when document_id is missing and names each station', async () => {
      const orderId = createOpenOrder(); // document_id = NULL
      const orderNo = (
        sqlite.prepare('SELECT order_no FROM orders WHERE id = ?').get(orderId) as any
      ).order_no;

      await printJobService.printKitchenTickets(orderId);

      expect(transport.sent.length).toBe(2);
      const byIp = new Map(transport.sent.map((s) => [s.ip, s.data.toString('ascii')]));
      expect(byIp.get('192.168.1.51')).toContain(`Order-${orderNo}`);
      expect(byIp.get('192.168.1.51')).toContain('Printer: Kitchen');
      expect(byIp.get('192.168.1.52')).toContain(`Order-${orderNo}`);
      expect(byIp.get('192.168.1.52')).toContain('Printer: Cold Station');
    });

    it('printKitchenDeltas passes order notes and item notes into the ticket', async () => {
      const orderId = createOpenOrder();
      sqlite.exec(`UPDATE orders SET notes = 'call on arrival' WHERE id = ${orderId}`);
      const oi = sqlite
        .prepare('SELECT id FROM order_items WHERE order_id = ?')
        .get(orderId) as any;
      sqlite.exec(`UPDATE order_items SET notes = 'no ice' WHERE id = ${oi.id}`);

      await printJobService.printKitchenDeltas(orderId, [
        { orderItemId: oi.id, printedQty: 2, itemName: 'Test Item' },
      ]);

      expect(transport.sent.length).toBe(2);
      const str = transport.sent[0].data.toString('ascii');
      expect(str).toContain('NOTES: call on arrival');
      expect(str).toContain('* no ice');
      expect(str).toContain('2 Test Item');
    });
  });
});
