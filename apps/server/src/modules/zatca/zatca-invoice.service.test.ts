/**
 * ZATCA Invoice Service — Credit Notes Tests
 *
 * Tests the credit-note creation flow for refunded orders.
 * Uses an in-memory SQLite DB and a minimal NestJS module.
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
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { generateKeyPair } from './zatca-crypto.service';
import { zatcaKey } from '@spicyhome/shared';
import * as forge from 'node-forge';

// ── Test certificate helper ──────────────────────────────────────────────────

function createTestZatcaCert(): string {
  const rsaKeys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = rsaKeys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const attrs = [
    { name: 'commonName', value: 'Test Cert' },
    { name: 'organizationName', value: 'SpicyHome Test' },
    { name: 'countryName', value: 'SA' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(rsaKeys.privateKey, forge.md.sha256.create());

  const pem = forge.pki.certificateToPem(cert);
  // Extract the base64 body between BEGIN/END markers
  const lines = pem
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l && !l.startsWith('-----'));
  const certBodyB64 = lines.join('');

  // ZATCA stores certs as base64(base64(cert_body))
  return Buffer.from(certBodyB64, 'utf-8').toString('base64');
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('ZatcaInvoiceService — credit notes', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let service: ZatcaInvoiceService;
  let printersService: PrintersService;
  let now: number;
  const TEST_ORG_UNIT = 'SpicyHome POS';
  const LAST_ICV_KEY = zatcaKey('simulation', TEST_ORG_UNIT, 'last_icv');

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // ── Apply migrations BEFORE creating NestJS module ─────────────────────
    // This ensures DatabaseModule.onModuleInit() sees existing tables
    // and skips seeding, preventing conflicts with our manual seed below.
    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db');
    const migrationsDir = findMigrationsDir();
    applyMigrations(sqlite, migrationsDir);

    now = Math.floor(Date.now() / 1000);

    // ── Seed users / roles BEFORE onModuleInit runs ────────────────────────
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

    // ── Now create the drizzle instance and the NestJS module ──────────────
    db = drizzle(sqlite, { schema });

    const moduleFixture = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), DatabaseModule, PrintersModule],
      providers: [ZatcaInvoiceService],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    service = app.get(ZatcaInvoiceService);
    printersService = app.get(PrintersService);

    // ── ZATCA key setup (via PrintersService, uses the same DB) ─────────────

    // Generate secp256k1 key pair for signing
    const keyPair = generateKeyPair();
    const testSecret = 'spicyhome-zatca-secret-change-me';

    // Store encrypted private key parts using the simulation-scoped keys
    service.storePrivateKey(keyPair.privateKeyHex, testSecret, 'simulation', TEST_ORG_UNIT);
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'public_key'),
      keyPair.publicKeyHex,
    );

    // Generate and store a test X.509 certificate
    const zatcaCert = createTestZatcaCert();
    printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'), zatcaCert);
  });

  afterAll(async () => {
    sqlite.close();
  });

  // ── Helper: create a paid order with invoice ──────────────────────────────

  function createPaidOrderWithInvoice(): {
    orderId: number;
    invoiceId: number;
    invoiceUuid: string;
  } {
    // create day_opening
    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-07-15', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // create order
    sqlite.exec(`
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
      VALUES (1, 'order-uuid-paid', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, ${now}, ${now})
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // create order_items
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Burger', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    // create invoice and set last_icv so allocateICV continues from here
    sqlite.exec(`
      INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
      VALUES (${orderId}, 1, 'invoice-uuid-001', 'test-hash-001', '', '<Invoice/>', 'tlv-data', 'signed', ${now}, ${now})
    `);
    const invoiceId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // Set last_icv to match the invoice's ICV so the next allocateICV call gets 2
    sqlite.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('${LAST_ICV_KEY}', '1')`);

    return { orderId, invoiceId, invoiceUuid: 'invoice-uuid-001' };
  }

  // ── Helper: create a refund with items for an order ──────────────────────

  function createRefundForOrder(orderId: number): number {
    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', 10000, 1500, 11500, 'Item was cold', ${now})
    `);
    const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // refund items matching the original order_item
    sqlite.exec(`
      INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
      VALUES (${refundId}, 'Burger', 11500, 1500, 1, 11500, ${now})
    `);

    return refundId;
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  describe('onOrderRefundIssued', () => {
    it('logs an error without throwing when there is no original invoice', async () => {
      // Create a new day_opening and order WITHOUT an invoice
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-16', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (2, 'order-uuid-noinv', 'dine_in', ${doId}, 'paid', 5000, 750, 5750, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Create refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', 5000, 750, 5750, 'Wrong item', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Spy on the logger's error method
      const loggerErrorSpy = jest.spyOn((service as any).logger, 'error');

      // Call the event listener — must not throw
      await expect(
        service.onOrderRefundIssued({ orderId, refundId, userId: 1 }),
      ).resolves.toBeUndefined();

      // Assert error was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to create ZATCA credit note for refund ${refundId}`),
      );

      // No credit_note row should exist in the DB
      const creditNoteCount = (
        sqlite
          .prepare('SELECT COUNT(*) as cnt FROM zatca_credit_notes WHERE order_id = ?')
          .get(orderId) as any
      ).cnt;
      expect(creditNoteCount).toBe(0);

      loggerErrorSpy.mockRestore();
    });
  });

  describe('createCreditNote', () => {
    it('throws when no original invoice exists', async () => {
      // Create order without invoice
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-17', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (3, 'order-uuid-nomatch', 'dine_in', ${doId}, 'paid', 3000, 450, 3450, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      await expect(service.createCreditNote(orderId, 1)).rejects.toThrow(
        `No original invoice found for order ${orderId}`,
      );
    });

    it('produces a credit_notes row with correct data on happy path', async () => {
      const { orderId, invoiceUuid } = createPaidOrderWithInvoice();
      const refundId = createRefundForOrder(orderId);

      const result = await service.createCreditNote(orderId, refundId);

      // Verify return value
      expect(result.id).toBeGreaterThan(0);
      expect(result.icv).toBe(2); // after the original invoice's ICV=1
      expect(result.uuid).toBeTruthy();

      // Verify the credit_notes row in DB
      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;

      expect(row).not.toBeUndefined();
      expect(row.related_invoice_uuid).toBe(invoiceUuid);
      expect(row.status).toBe('signed');
      expect(row.icv).toBe(2);
      expect(row.total_halalas).toBe(11500);
      expect(row.vat_halalas).toBe(1500);
      expect(row.reason).toBe('Item was cold');
      expect(row.order_id).toBe(orderId);
      expect(row.refund_id).toBe(refundId);

      // XML assertions
      expect(row.xml).toContain('<Invoice');
      expect(row.xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
      expect(row.xml).toContain('BillingReference');
      expect(row.xml).toContain(invoiceUuid);
      expect(row.xml).toContain('<cbc:InstructionNote>Item was cold</cbc:InstructionNote>');

      // QR TLV should be present
      expect(row.qr_tlv).toBeTruthy();

      // invoice_hash should be set
      expect(row.invoice_hash).toBeTruthy();
      expect(row.invoice_hash.length).toBe(44); // base64 of 32-byte SHA-256

      // prev_invoice_hash should point to the original invoice's hash
      expect(row.prev_invoice_hash).toBe('test-hash-001');
    });

    it('uses "Refund" as default paymentNote when reason is null', async () => {
      // Create a new paid order + invoice
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-18', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (4, 'order-uuid-noreason', 'dine_in', ${doId}, 'paid', 5000, 750, 5750, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Sync last_icv to match the latest state (previous tests may have incremented it)
      const lastIcvRowReason = sqlite
        .prepare(`SELECT value FROM settings WHERE key = '${LAST_ICV_KEY}'`)
        .get() as any;
      const currentLastIcvReason = lastIcvRowReason ? parseInt(lastIcvRowReason.value, 10) : 0;
      const invoiceIcvReason = currentLastIcvReason + 1;

      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, ${invoiceIcvReason}, 'invoice-uuid-003', 'hash-003', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);
      sqlite.exec(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('${LAST_ICV_KEY}', '${invoiceIcvReason}')`,
      );

      // Create refund with NULL reason
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', 5000, 750, 5750, NULL, ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
        VALUES (${refundId}, 'Fries', 5750, 1500, 1, 5750, ${now})
      `);

      const result = await service.createCreditNote(orderId, refundId);
      expect(result.id).toBeGreaterThan(0);

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;

      expect(row.reason).toBe('Refund');
      expect(row.xml).toContain('<cbc:InstructionNote>Refund</cbc:InstructionNote>');
    });

    it('ICV is monotonically increasing across invoices and credit_notes', async () => {
      // Create a new order
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-19', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (5, 'order-uuid-seq', 'dine_in', ${doId}, 'paid', 2000, 300, 2300, ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Read the current last_icv to determine the next ICV for our invoice
      const lastIcvRow = sqlite
        .prepare(`SELECT value FROM settings WHERE key = '${LAST_ICV_KEY}'`)
        .get() as any;
      const currentLastIcv = lastIcvRow ? parseInt(lastIcvRow.value, 10) : 0;
      const nextIcv = currentLastIcv + 1;

      // Create an invoice for this order with the next ICV
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, ${nextIcv}, 'invoice-uuid-seq', 'hash-seq', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);
      // Update last_icv to reflect this invoice's ICV
      sqlite.exec(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('${LAST_ICV_KEY}', '${nextIcv}')`,
      );

      // Refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', 2000, 300, 2300, 'Test sequence', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
        VALUES (${refundId}, 'Drink', 2300, 1500, 1, 2300, ${now})
      `);

      const result = await service.createCreditNote(orderId, refundId);
      // Credit note ICV should be greater than the invoice's ICV
      expect(result.icv).toBeGreaterThan(nextIcv);

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;

      // prev_invoice_hash should match the invoice we created
      expect(row.prev_invoice_hash).toBe('hash-seq');
      expect(row.icv).toBeGreaterThan(nextIcv);
    });
  });
});
