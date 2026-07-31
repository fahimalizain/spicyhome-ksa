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

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('${businessDate}', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO orders (
        order_no, uuid, type, day_opening_id, status,
        subtotal_halalas, vat_halalas, total_halalas,
        created_at, updated_at
      ) VALUES (
        ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
        10000, 1500, 11500,
        ${now}, ${now}
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
    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Test', ${now})
    `);
    const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
      VALUES (${refundId}, 'Test Item', 11500, 1500, 1, 11500, ${now})
    `);

    return refundId;
  }

  // ── printReceipt — QR fallback from zatca_invoices ─────────────────────

  describe('printReceipt', () => {
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

  // ── printRefundReceipt — QR fallback from zatca_credit_notes ──────────

  describe('printRefundReceipt', () => {
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
});
