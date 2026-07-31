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
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, '48', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('mada', 'mada', 1, 2, '48', ${now}, ${now});
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
      INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
      VALUES (${orderId}, 1, 'invoice-uuid-001', 'DOC-' || 'invoice-uuid-001', 'test-hash-001', '', '<Invoice/>', 'tlv-data', 'signed', ${now}, ${now})
    `);
    const invoiceId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // Set last_icv to match the invoice's ICV so the next allocateICV call gets 2
    sqlite.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('${LAST_ICV_KEY}', '1')`);

    return { orderId, invoiceId, invoiceUuid: 'invoice-uuid-001' };
  }

  // ── Helper: create a refund with items for an order ──────────────────────

  function createRefundForOrder(orderId: number): number {
    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Item was cold', 'REF-TEST-HP', ${now})
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
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 5000, 750, 5750, 'Wrong item', 'REF-TEST-NOINV', ${now})
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
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, ${invoiceIcvReason}, 'invoice-uuid-003', 'DOC-' || 'invoice-uuid-003', 'hash-003', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);
      sqlite.exec(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('${LAST_ICV_KEY}', '${invoiceIcvReason}')`,
      );

      // Create refund with NULL reason
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 5000, 750, 5750, NULL, 'REF-TEST-NULL-REASON', ${now})
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
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, ${nextIcv}, 'invoice-uuid-seq', 'DOC-' || 'invoice-uuid-seq', 'hash-seq', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);
      // Update last_icv to reflect this invoice's ICV
      sqlite.exec(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('${LAST_ICV_KEY}', '${nextIcv}')`,
      );

      // Refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 2000, 300, 2300, 'Test sequence', 'REF-TEST-SEQ', ${now})
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

  // ── Helper: create a standard invoice order with buyer fields ────────────

  function createStandardInvoiceOrder(): number {
    // Need a unique order_no + uuid
    const orderNo = 900 + Math.floor(Math.random() * 1000);
    const uuid = `order-std-${orderNo}-${Date.now()}`;
    const businessDate = '2024-07-20';

    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('${businessDate}', 'open', ${now}, 1, ${now}, ${now})
    `);
    const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    const buyerJson = JSON.stringify({
      name: 'Fatoora Samples LTD',
      vatNumber: '399999999800003',
      street: 'Salah Al-Din',
      buildingNumber: '1111',
      citySubdivision: 'Al-Murooj',
      city: 'Riyadh',
      postalCode: '12222',
      country: 'SA',
    });

    sqlite.exec(`
      INSERT INTO orders (
        order_no, uuid, type, day_opening_id, status,
        subtotal_halalas, vat_halalas, total_halalas,
        is_standard_invoice,
        zatca_buyer_details,
        created_at, updated_at
      ) VALUES (
        ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
        10000, 1500, 11500,
        1,
        '${buyerJson.replace(/'/g, "''")}',
        ${now}, ${now}
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Standard Item', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    return orderId;
  }

  // ── Phase 6: standard invoice routing guards ─────────────────────────────

  describe('Phase 6 — standard invoice guards', () => {
    it('onOrderPaid skips standard invoice orders (leaves to ZatcaStandardInvoiceService)', async () => {
      const orderId = createStandardInvoiceOrder();

      // Spy on the logger
      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn');

      await expect(service.onOrderPaid({ orderId, userId: 1 })).resolves.toBeUndefined();

      // No invoice row created
      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).toBeUndefined();

      loggerWarnSpy.mockRestore();
    });

    it('createInvoice throws for standard invoice orders (programmer error guard)', async () => {
      const orderId = createStandardInvoiceOrder();

      // Direct call to createInvoice on a standard order must throw
      await expect(service.createInvoice(orderId)).rejects.toThrow(
        /Use createStandardInvoice for clearance/,
      );
    });

    it('onOrderPaid still creates simplified invoice for non-standard orders', async () => {
      // Create a simplified order
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-21', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (999, 'uuid-phase6-simple', 'dine_in', ${doId}, 'paid', 5000, 750, 5750, 'INV-TEST-PHASE6', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (${orderId}, 'Burger', 5750, 1500, 1, 5750, ${now}, ${now})
      `);

      // onOrderPaid should still work for simplified
      await expect(service.onOrderPaid({ orderId, userId: 1 })).resolves.toBeUndefined();

      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('signed');
    });

    it('onOrderRefundIssued skips standard invoice orders', async () => {
      const orderId = createStandardInvoiceOrder();

      // Create a zatca_invoices row (simulating prior standard invoice creation)
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, 100, 'std-uuid-001', 'DOC-' || 'std-uuid-001', 'hash-std-001', '', '<Invoice/>', 'tlv', 'cleared', ${now}, ${now})
      `);

      // Create a refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Reason', 'REF-TEST-STDSKIP', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
        VALUES (${refundId}, 'Standard Item', 11500, 1500, 1, 11500, ${now})
      `);

      await expect(
        service.onOrderRefundIssued({ orderId, refundId, userId: 1 }),
      ).resolves.toBeUndefined();

      // No simplified credit note created
      const cn = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(cn).toBeUndefined();
    });
  });

  // ── documentId column snapshot on list/get endpoints ───────────────────

  describe('documentId column snapshot (list/get)', () => {
    it('listInvoices and getById return the zatca_invoices.document_id column', async () => {
      // Fresh day opening + order WITH a document_id
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-25', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (7001, 'order-docid-inv', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, 'INV-LIST-001', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // zatca row snapshots the document_id at insert time
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, 900, 'inv-docid-list', 'INV-LIST-001', 'hash-docid-list', '', '<Invoice/>', 'tlv', 'signed', ${now}, ${now})
      `);
      const invoiceId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      const all = service.listInvoices(50, 0);
      const row = all.find((r: any) => r.id === invoiceId);
      expect(row).toBeDefined();
      expect(row.orderId).toBe(orderId);
      expect(row.documentId).toBe('INV-LIST-001');

      const detail = service.getById(invoiceId);
      expect(detail.documentId).toBe('INV-LIST-001');
    });

    it('listCreditNotes and getCreditNoteById return the zatca_credit_notes.document_id column', async () => {
      // Fresh day opening + order + refund WITH a document_id + credit note
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-26', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (7002, 'order-docid-cn', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, 'INV-LIST-002', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Refund docid', 'REF-LIST-001', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // zatca row snapshots the refund's document_id at insert time
      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-docid-list', 901, 'cn-docid-list', 'REF-LIST-001', 'hash-cn-docid', '', '<CreditNote/>', 'tlv', 'signed', 11500, 1500, 'Refund docid', ${now}, ${now})
      `);
      const cnId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      const all = service.listCreditNotes(50, 0);
      const row = all.find((r: any) => r.id === cnId);
      expect(row).toBeDefined();
      expect(row.refundId).toBe(refundId);
      expect(row.documentId).toBe('REF-LIST-001');

      const detail = service.getCreditNoteById(cnId);
      expect(detail.documentId).toBe('REF-LIST-001');
    });

    it('invoice snapshot survives order document_id rotation after rejection', async () => {
      // Fresh day opening + order with document_id 'INV-SNAP-001'
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-27', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (7003, 'order-docid-rotate', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, 'INV-SNAP-001', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Attempt row burned 'INV-SNAP-001' into its document_id column
      sqlite.exec(`
        INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
        VALUES (${orderId}, 902, 'inv-docid-rotate', 'INV-SNAP-001', 'hash-rotate', '', '<Invoice/>', 'tlv', 'rejected', ${now}, ${now})
      `);
      const invoiceId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Clearance rejection rotates the LIVE order document_id (new attempt)
      sqlite.exec(`
        UPDATE orders SET document_id = 'INV-SNAP-002', updated_at = ${now} WHERE id = ${orderId}
      `);

      // The historical zatca row must keep the burned ID (same one embedded in its XML cbc:ID)
      const detail = service.getById(invoiceId);
      expect(detail.documentId).toBe('INV-SNAP-001');

      const listRow = service.listInvoices(50, 0).find((r: any) => r.id === invoiceId);
      expect(listRow.documentId).toBe('INV-SNAP-001');

      // The live order rotation is visible on orders only
      const order = sqlite
        .prepare('SELECT document_id FROM orders WHERE id = ?')
        .get(orderId) as any;
      expect(order.document_id).toBe('INV-SNAP-002');
    });

    it('credit note snapshot survives refund document_id rotation after rejection', async () => {
      // Fresh day opening + order + refund with document_id 'REF-SNAP-001'
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-28', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (7004, 'order-docid-cn-rotate', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, 'INV-SNAP-003', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Refund rotate', 'REF-SNAP-001', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, reason, created_at, updated_at)
        VALUES (${orderId}, ${refundId}, 'inv-docid-cn-rotate', 903, 'cn-docid-rotate', 'REF-SNAP-001', 'hash-cn-rotate', '', '<CreditNote/>', 'tlv', 'rejected', 11500, 1500, 'Refund rotate', ${now}, ${now})
      `);
      const cnId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Clearance rejection rotates the LIVE refund document_id
      sqlite.exec(`
        UPDATE order_refunds SET document_id = 'REF-SNAP-002' WHERE id = ${refundId}
      `);

      // The historical zatca row must keep the burned ID
      const detail = service.getCreditNoteById(cnId);
      expect(detail.documentId).toBe('REF-SNAP-001');

      const listRow = service.listCreditNotes(50, 0).find((r: any) => r.id === cnId);
      expect(listRow.documentId).toBe('REF-SNAP-001');
    });
  });

  // ── Payment Means code resolution ────────────────────────────────────────

  describe('PaymentMeansCode resolution', () => {
    function createPaidOrderForInvoice(
      payments: Array<{ methodId: string; amount: number }>,
    ): number {
      const seq = sqlite
        .prepare('SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders')
        .get() as any;
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-08-0${seq.next}', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (${seq.next}, 'order-uuid-pm-${seq.next}', 'dine_in', ${doId}, 'paid', 10000, 1500, 11500, 'INV26-PM-${seq.next}', ${now}, ${now})
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (${orderId}, 'Burger', 11500, 1500, 1, 11500, ${now}, ${now})
      `);

      for (const p of payments) {
        sqlite.exec(`
          INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
          VALUES (${orderId}, '${p.methodId}', '${p.methodId}', (SELECT zatca_payment_means_code FROM payment_methods WHERE id = '${p.methodId}'), ${p.amount}, ${now})
        `);
      }

      return orderId;
    }

    it('emits PaymentMeansCode 10 for a cash-paid order', async () => {
      const orderId = createPaidOrderForInvoice([{ methodId: 'cash', amount: 11500 }]);
      const result = await service.createInvoice(orderId);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
      expect(result.signedXml).not.toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    });

    it('emits PaymentMeansCode 48 for a card-paid order', async () => {
      const orderId = createPaidOrderForInvoice([{ methodId: 'card', amount: 11500 }]);
      const result = await service.createInvoice(orderId);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
      expect(result.signedXml).not.toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
    });

    it('emits PaymentMeansCode 48 for mada-paid order (mada maps to bank card)', async () => {
      const orderId = createPaidOrderForInvoice([{ methodId: 'mada', amount: 11500 }]);
      const result = await service.createInvoice(orderId);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    });

    it('split tender uses the largest-amount line code', async () => {
      // card 7000 > cash 4500 → 48
      const orderId = createPaidOrderForInvoice([
        { methodId: 'card', amount: 7000 },
        { methodId: 'cash', amount: 4500 },
      ]);
      const result = await service.createInvoice(orderId);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    });

    it('split tender tie-breaks by methodId ascending', async () => {
      // Equal amounts: 'card' < 'cash' lexicographically → 48
      const orderId = createPaidOrderForInvoice([
        { methodId: 'cash', amount: 5750 },
        { methodId: 'card', amount: 5750 },
      ]);
      const result = await service.createInvoice(orderId);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
    });

    it('credit note uses the refund method snapshot code', async () => {
      const orderId = createPaidOrderForInvoice([{ methodId: 'cash', amount: 11500 }]);
      const invoice = await service.createInvoice(orderId);

      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
        VALUES (${orderId}, 1, 'card', 'Card', '48', 10000, 1500, 11500, 'Card refund', 'REF26-PM-1', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      const result = await service.createCreditNote(orderId, refundId);
      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;

      expect(result.icv).toBe(invoice.icv + 1);
      expect(row.xml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
      expect(row.xml).toContain('<cbc:InstructionNote>Card refund</cbc:InstructionNote>');
    });

    it('invoice falls back to 10 when order has no payment rows (legacy edge case)', async () => {
      const orderId = createPaidOrderForInvoice([]);
      const result = await service.createInvoice(orderId);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
    });
  });
});
