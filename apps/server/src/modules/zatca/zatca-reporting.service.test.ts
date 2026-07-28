/**
 * ZATCA Reporting Service — Unit Tests
 *
 * Tests the reporting worker for both invoices and credit notes.
 * Uses an in-memory SQLite DB, a NestJS test module, and a Fake HTTP client.
 */

import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { DatabaseModule } from '../database/database.module';
import { PrintersModule } from '../printers/printers.module';
import { PrintersService } from '../printers/printers.service';
import { DRIZZLE } from '../database/database.module';
import { ZatcaReportingService } from './zatca-reporting.service';
import { FakeZatcaHttpClient, ZatcaHttpService } from './zatca-http.service';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { zatcaKey } from '@spicyhome/shared';

let seq = 0;
function nextSeq(): number {
  return ++seq;
}

describe('ZatcaReportingService', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let reportingService: ZatcaReportingService;
  let invoiceService: ZatcaInvoiceService;
  let printersService: PrintersService;
  let fakeHttp: FakeZatcaHttpClient;
  let now: number;
  const TEST_ORG_UNIT = 'SpicyHome POS';

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // Apply migrations
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
    sqlite.exec(`
      INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
      VALUES (1, 'Counter', '192.168.1.50', 9100, 'receipt', 1, ${now}, ${now})
    `);
    sqlite.exec(`
      INSERT INTO settings (key, value) VALUES ('seller_name', 'Test Restaurant');
      INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789003');
      INSERT INTO settings (key, value) VALUES ('seller_city', 'Riyadh');
      INSERT INTO settings (key, value) VALUES ('seller_country', 'SA');
      INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
      INSERT INTO settings (key, value) VALUES ('zatca_org_unit', '${TEST_ORG_UNIT}');
      INSERT INTO settings (key, value) VALUES ('zatca_api_base_url', 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation');
    `);
    // Payment methods required by order_refunds FK
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('mada', 'mada', 1, 2, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    fakeHttp = new FakeZatcaHttpClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), DatabaseModule, PrintersModule],
      providers: [ZatcaReportingService, ZatcaInvoiceService, ZatcaHttpService],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .overrideProvider(ZatcaHttpService)
      .useValue(fakeHttp)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    reportingService = app.get(ZatcaReportingService);
    invoiceService = app.get(ZatcaInvoiceService);
    printersService = app.get(PrintersService);

    // Stop auto-polling during tests
    reportingService.stopPolling();

    // Set onboarding state to 'compliance' so reporting can run
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'onboarding_state'),
      'compliance',
    );

    // Set fake compliance credentials
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'),
      'ZmFrZS1jZXJ0', // base64("fake-cert") — basic auth username
    );
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'),
      'ZmFrZS1zZWNyZXQ=', // base64("fake-secret") — basic auth password
    );
  });

  afterAll(async () => {
    sqlite.close();
  });

  // ── Helper: create a paid order with invoice ───────────────────────────

  function createOrderWithInvoice(suffix: number): { orderId: number; invoiceId: number } {
    const orderNo = suffix;
    const orderUuid = `order-uuid-${suffix}`;
    const invUuid = `inv-uuid-${suffix}`;
    const invHash = `invoice-hash-${suffix}`;

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-07-15', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
      VALUES (${orderNo}, '${orderUuid}', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, ${now}, ${now})
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Burger', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    sqlite.exec(`
      INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
      VALUES (${orderId}, ${suffix}, '${invUuid}', '${invHash}', '', '<Invoice>test</Invoice>', 'tlv', 'signed', ${now}, ${now})
    `);
    const invoiceId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('${zatcaKey('simulation', TEST_ORG_UNIT, 'last_icv')}', '${suffix}')`,
    );

    return { orderId, invoiceId };
  }

  // ── Helper: create a refund with credit note ───────────────────────────

  function createOrderWithCreditNote(suffix: number): {
    orderId: number;
    refundId: number;
    creditNoteId: number;
  } {
    const orderNo = suffix;
    const orderUuid = `order-uuid-cn-${suffix}`;
    const invUuid = `inv-uuid-cn-${suffix}`;
    const invHash = `invoice-hash-cn-${suffix}`;
    const cnUuid = `cn-uuid-${suffix}`;
    const cnHash = `credit-hash-${suffix}`;

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-07-16', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
      VALUES (${orderNo}, '${orderUuid}', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, ${now}, ${now})
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
      VALUES (${orderId}, ${suffix}, '${invUuid}', '${invHash}', 'prev-hash', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
    `);

    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', 10000, 1500, 11500, 'Test refund', ${now})
    `);
    const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
      VALUES (${refundId}, 'Burger', 11500, 1500, 1, 11500, ${now})
    `);

    const cnIcv = suffix + 100;
    sqlite.exec(`
      INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, reported_at, total_halalas, vat_halalas, reason, created_at, updated_at)
      VALUES (${orderId}, ${refundId}, '${invUuid}', ${cnIcv}, '${cnUuid}', '${cnHash}', '${invHash}', '<CreditNote>test</CreditNote>', 'tlv', 'signed', NULL, 11500, 1500, 'Test refund', ${now}, ${now})
    `);
    const creditNoteId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('${zatcaKey('simulation', TEST_ORG_UNIT, 'last_icv')}', '${cnIcv}')`,
    );

    return { orderId, refundId, creditNoteId };
  }

  beforeEach(() => {
    // Reset fake HTTP responses and recorded requests between tests
    fakeHttp.responses.clear();
    fakeHttp.requests = [];

    // Clean up ZATCA documents from previous tests (FK-aware order)
    sqlite.exec(`
      DELETE FROM zatca_credit_notes;
      DELETE FROM zatca_invoices;
      DELETE FROM order_refund_items;
      DELETE FROM order_refunds;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM day_openings;
    `);

    // Re-seed ZATCA-related settings that may have been cleared
    printersService.setSetting('zatca_org_unit', TEST_ORG_UNIT);
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'onboarding_state'),
      'compliance',
    );
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'),
      'ZmFrZS1jZXJ0',
    );
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'),
      'ZmFrZS1zZWNyZXQ=',
    );
    printersService.setSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    );
    printersService.setSetting('seller_name', 'Test Restaurant');
    printersService.setSetting('vat_number', '300123456789003');
    printersService.setSetting('seller_city', 'Riyadh');
    printersService.setSetting('seller_country', 'SA');
  });

  // ── Tests ──────────────────────────────────────────────────────────────

  describe('processQueue', () => {
    it('reports a pending invoice successfully', async () => {
      const s = nextSeq();
      const { invoiceId } = createOrderWithInvoice(s);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBe(0);

      // Verify invoice status updated
      const inv = sqlite
        .prepare('SELECT status, reported_at FROM zatca_invoices WHERE id = ?')
        .get(invoiceId) as any;
      expect(inv.status).toBe('reported');
      expect(inv.reported_at).toBeGreaterThan(0);
    });

    it('reports a pending credit note successfully', async () => {
      const s = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBe(0);

      // Verify credit note status updated
      const cn = sqlite
        .prepare('SELECT status, reported_at FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('reported');
      expect(cn.reported_at).toBeGreaterThan(0);
    });

    it('processes both invoices and credit notes in one run', async () => {
      const s1 = nextSeq();
      createOrderWithInvoice(s1);
      const s2 = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s2);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.succeeded).toBeGreaterThanOrEqual(2);
      expect(result.failed).toBe(0);

      // Both should be reported
      const cn = sqlite
        .prepare('SELECT status FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('reported');
    });

    it('marks credit note as failed when HTTP returns non-200', async () => {
      const s = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s);

      fakeHttp.responses.set('reporting', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid request' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(result.succeeded).toBe(0);

      // Verify credit note status is 'failed'
      const cn = sqlite
        .prepare('SELECT status, reported_at FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('failed');
      expect(cn.reported_at).toBeNull();
    });

    it('marks invoice as failed when HTTP returns non-200', async () => {
      const s = nextSeq();
      const { invoiceId } = createOrderWithInvoice(s);

      fakeHttp.responses.set('reporting', {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Internal error' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.failed).toBeGreaterThanOrEqual(1);

      const inv = sqlite
        .prepare('SELECT status, reported_at FROM zatca_invoices WHERE id = ?')
        .get(invoiceId) as any;
      expect(inv.status).toBe('failed');
      expect(inv.reported_at).toBeNull();
    });

    it('handles 202 response as success', async () => {
      const s = nextSeq();
      createOrderWithInvoice(s);

      fakeHttp.responses.set('reporting', {
        status: 202,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ACCEPTED' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
    });

    it('skips when onboarding state is not complete', async () => {
      // Reset onboarding state
      printersService.setSetting(
        zatcaKey('simulation', TEST_ORG_UNIT, 'onboarding_state'),
        'not_started',
      );

      const s = nextSeq();
      createOrderWithInvoice(s);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);

      // Restore onboarding state for subsequent tests
      printersService.setSetting(
        zatcaKey('simulation', TEST_ORG_UNIT, 'onboarding_state'),
        'compliance',
      );
    });

    it('handles missing credentials gracefully', async () => {
      // Remove credentials
      printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'), '');
      printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'), '');

      const s = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s);

      const result = await reportingService.retryInvoice();
      expect(result.failed).toBeGreaterThanOrEqual(1);

      // Credit note should be marked as failed
      const cn = sqlite
        .prepare('SELECT status FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('failed');

      // Restore credentials for subsequent tests
      printersService.setSetting(
        zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'),
        'ZmFrZS1jZXJ0',
      );
      printersService.setSetting(
        zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'),
        'ZmFrZS1zZWNyZXQ=',
      );
    });

    it('returns zeros when queues are empty', async () => {
      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });

    it('handles HTTP error exceptions without throwing', async () => {
      const s = nextSeq();
      createOrderWithInvoice(s);

      fakeHttp.nextError = new Error('Network error');

      const result = await reportingService.retryInvoice();
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });

    it('retries documents that were previously failed', async () => {
      const s = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s);

      // First: fail it
      fakeHttp.responses.set('reporting', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Bad request' }),
      });

      await reportingService.retryInvoice();

      let cn = sqlite
        .prepare('SELECT status FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('failed');

      // Second: succeed
      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.succeeded).toBeGreaterThanOrEqual(1);

      cn = sqlite
        .prepare('SELECT status, reported_at FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('reported');
      expect(cn.reported_at).toBeGreaterThan(0);
    });

    it('reports mixed invoices and credit notes in ascending ICV order', async () => {
      // Insert one shared day_opening
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-08-15', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Order 1 → invoice icv=3 (deliberately higher, to test sort)
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (5001, 'uuid-order-5001', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, ${now}, ${now})
      `);
      const orderId3 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId3}, 3, 'uuid-icv-3', 'hash-icv-3', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);

      // Order 2 → credit note icv=2 (needs a refund)
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (5002, 'uuid-order-5002', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, ${now}, ${now})
      `);
      const orderId2 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId2}, 1, 'cash', 'Cash', 10000, 1500, 11500, 'Test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, reported_at, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId2}, ${refundId}, 'any-inv-uuid', 2, 'uuid-icv-2', 'hash-icv-2', '', '<CreditNote/>', 'tlv', 'signed', NULL, 11500, 1500, 'Test', ${now}, ${now})
      `);

      // Order 3 → invoice icv=1
      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (5003, 'uuid-order-5003', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, ${now}, ${now})
      `);
      const orderId1 = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId1}, 1, 'uuid-icv-1', 'hash-icv-1', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.processed).toBe(3);
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);

      // Verify reporting order: icv=1, icv=2, icv=3
      const reportedUuids = fakeHttp.requests
        .filter((r) => r.url.includes('reporting'))
        .map((r) => JSON.parse(r.options.body).uuid);
      expect(reportedUuids).toEqual(['uuid-icv-1', 'uuid-icv-2', 'uuid-icv-3']);
    });

    it('processes a large backlog of more than 10 documents in one run', async () => {
      // Insert one shared day_opening
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-08-16', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      const count = 12;
      for (let i = 1; i <= count; i++) {
        const orderNo = 6000 + i;
        sqlite.exec(`
          INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
          VALUES (${orderNo}, 'uuid-large-${i}', 'dine_in', ${doId}, 'paid', ${i * 1000}, ${Math.round(i * 150)}, ${Math.round(i * 1150)}, ${now}, ${now})
        `);
        const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;
        sqlite.exec(`
          INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
          VALUES (${orderId}, ${i}, 'uuid-icv-${i}', 'hash-icv-${i}', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
        `);
      }

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice();
      expect(result.processed).toBe(count);
      expect(result.succeeded).toBe(count);
      expect(result.failed).toBe(0);

      // All invoices should now be 'reported'
      const remaining = sqlite
        .prepare("SELECT COUNT(*) as c FROM zatca_invoices WHERE status != 'reported'")
        .get() as any;
      expect(remaining.c).toBe(0);
    });
  });

  describe('retryInvoice with specific id', () => {
    it('reports a specific invoice by id', async () => {
      const s = nextSeq();
      const { invoiceId } = createOrderWithInvoice(s);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryInvoice(invoiceId);
      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);

      const inv = sqlite
        .prepare('SELECT status FROM zatca_invoices WHERE id = ?')
        .get(invoiceId) as any;
      expect(inv.status).toBe('reported');
    });

    it('returns zero results when invoice does not exist', async () => {
      const result = await reportingService.retryInvoice(99999);
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });

    it('single invoice retry does not affect credit notes', async () => {
      const s1 = nextSeq();
      const { invoiceId } = createOrderWithInvoice(s1);
      const s2 = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s2);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      await reportingService.retryInvoice(invoiceId);

      // Invoice should be reported
      const inv = sqlite
        .prepare('SELECT status FROM zatca_invoices WHERE id = ?')
        .get(invoiceId) as any;
      expect(inv.status).toBe('reported');

      // Credit note should remain signed
      const cn = sqlite
        .prepare('SELECT status FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('signed');
    });

    it('single credit note retry does not affect invoices', async () => {
      const s1 = nextSeq();
      const { invoiceId } = createOrderWithInvoice(s1);
      const s2 = nextSeq();
      const { creditNoteId } = createOrderWithCreditNote(s2);

      fakeHttp.responses.set('reporting', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await reportingService.retryReporting({ creditNoteId });
      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);

      // Credit note should be reported
      const cn = sqlite
        .prepare('SELECT status FROM zatca_credit_notes WHERE id = ?')
        .get(creditNoteId) as any;
      expect(cn.status).toBe('reported');

      // Invoice should remain signed
      const inv = sqlite
        .prepare('SELECT status FROM zatca_invoices WHERE id = ?')
        .get(invoiceId) as any;
      expect(inv.status).toBe('signed');
    });

    it('single credit note retry returns zero for non-existent id', async () => {
      const result = await reportingService.retryReporting({ creditNoteId: 99999 });
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });
  });
});
