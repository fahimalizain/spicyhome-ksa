/**
 * ZATCA Standard Invoice Service — Unit Tests
 *
 * Tests the createStandardInvoice() flow: build, sign, clear, persist.
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
import { ZatcaStandardInvoiceService } from './zatca-standard-invoice.service';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaClearanceService } from './zatca-clearance.service';
import { OrderEventsService } from '../orders/order-events.service';
import { DocumentIdService } from '../orders/document-id.allocator';
import { FakeZatcaHttpClient, ZatcaHttpService } from './zatca-http.service';
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
  const lines = pem
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l && !l.startsWith('-----'));
  const certBodyB64 = lines.join('');

  return Buffer.from(certBodyB64, 'utf-8').toString('base64');
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe('ZatcaStandardInvoiceService', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let standardService: ZatcaStandardInvoiceService;
  let invoiceService: ZatcaInvoiceService;
  let printersService: PrintersService;
  let fakeHttp: FakeZatcaHttpClient;
  let now: number;
  const TEST_ORG_UNIT = 'SpicyHome POS';

  // Counter for unique order_no and uuid
  let orderSeq = 0;

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
    sqlite.exec(`
      INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
      VALUES (1, 'Counter', '192.168.1.50', 9100, 'receipt', 1, ${now}, ${now})
    `);
    sqlite.exec(`
      INSERT INTO settings (key, value) VALUES ('seller_name', 'Test Restaurant');
      INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789003');
      INSERT INTO settings (key, value) VALUES ('seller_street', 'Main Street');
      INSERT INTO settings (key, value) VALUES ('seller_building', '1234');
      INSERT INTO settings (key, value) VALUES ('seller_city', 'Riyadh');
      INSERT INTO settings (key, value) VALUES ('seller_postal', '12345');
      INSERT INTO settings (key, value) VALUES ('seller_country', 'SA');
      INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
      INSERT INTO settings (key, value) VALUES ('zatca_org_unit', '${TEST_ORG_UNIT}');
      INSERT INTO settings (key, value) VALUES ('zatca_api_base_url', 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation');
    `);

    // Payment methods
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, '48', ${now}, ${now})
    `);

    db = drizzle(sqlite, { schema });
    fakeHttp = new FakeZatcaHttpClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), DatabaseModule, PrintersModule],
      providers: [
        ZatcaStandardInvoiceService,
        ZatcaInvoiceService,
        ZatcaClearanceService,
        ZatcaHttpService,
        OrderEventsService,
        DocumentIdService,
      ],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .overrideProvider(ZatcaHttpService)
      .useValue(fakeHttp)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    standardService = app.get(ZatcaStandardInvoiceService);
    invoiceService = app.get(ZatcaInvoiceService);
    printersService = app.get(PrintersService);

    // ── ZATCA key setup ────────────────────────────────────────────────────

    const keyPair = generateKeyPair();
    const testSecret = 'spicyhome-zatca-secret-change-me';

    invoiceService.storePrivateKey(keyPair.privateKeyHex, testSecret, 'simulation', TEST_ORG_UNIT);
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'public_key'),
      keyPair.publicKeyHex,
    );

    const zatcaCert = createTestZatcaCert();
    printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'), zatcaCert);
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'),
      'ZmFrZS1zZWNyZXQ=',
    );
  });

  afterAll(async () => {
    sqlite.close();
  });

  beforeEach(() => {
    fakeHttp.requests = [];
    fakeHttp.responses.clear();
    fakeHttp.nextError = null;
  });

  // ── Helper: create a standard invoice order with buyer fields ────────────

  function createStandardOrder(): number {
    orderSeq++;
    const uuid = `order-std-uuid-${orderSeq}`;
    const orderNo = 100 + orderSeq;
    const invoiceId = `TEST-STD-${orderSeq}`;
    const businessDate = `2024-07-${String(15 + orderSeq).padStart(2, '0')}`;

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
        document_id,
        created_at, updated_at
      ) VALUES (
        ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
        10000, 1500, 11500,
        1,
        '${buyerJson.replace(/'/g, "''")}',
        '${invoiceId}',
        ${now}, ${now}
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Office Supplies', 11500, 1500, 1, 11500, ${now}, ${now})
    `);

    return orderId;
  }

  // ── Helper: create a simplified order (no buyer, is_standard_invoice=0) ─────

  function createSimplifiedOrder(): number {
    orderSeq++;
    const uuid = `order-simple-uuid-${orderSeq}`;
    const orderNo = 200 + orderSeq;
    const invoiceId = `TEST-SIMPLE-${orderSeq}`;
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
        is_standard_invoice, document_id, created_at, updated_at
      ) VALUES (
        ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
        5000, 750, 5750,
        0, '${invoiceId}', ${now}, ${now}
      )
    `);
    const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderId}, 'Burger', 5750, 1500, 1, 5750, ${now}, ${now})
    `);

    return orderId;
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  describe('createStandardInvoice', () => {
    it('creates signed XML, clears with ZATCA, and persists with status cleared', async () => {
      const orderId = createStandardOrder();

      // The cleared XML from ZATCA will contain ZATCA's own formatting.
      // After signing, we embed our own signature and QR into the XML containing
      // the standard subtype 0100000 and buyer VAT.
      const clearedXml = '<Invoice>cleared_by_zatca</Invoice>';
      const clearedB64 = Buffer.from(clearedXml).toString('base64');

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: clearedB64,
        }),
      });

      const result = await standardService.createStandardInvoice(orderId, 1);

      // Return value checks
      expect(result.id).toBeGreaterThan(0);
      expect(result.icv).toBe(1);
      expect(result.uuid).toBeTruthy();
      expect(result.invoiceHash).toBeTruthy();
      expect(result.status).toBe('cleared');
      expect(result.qrTlvBase64).toBeTruthy();
      expect(result.signedXml).toBe(clearedXml);
      expect(result.clearance.status).toBe('CLEARED');

      // DB row checks — stored XML is the cleared XML
      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('cleared');
      expect(row.icv).toBe(1);
      expect(row.xml).toBe(clearedXml);
      expect(row.reported_at).not.toBeNull();
      expect(row.qr_tlv).toBeTruthy();

      // Clearance was called
      expect(fakeHttp.requests.length).toBe(1);
      const req = fakeHttp.requests[0];
      expect(req.options.headers['Clearance-Status']).toBe('1');
    });

    it('stores signed XML when clearedXml is null in clearance response', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearanceStatus: 'CLEARED' }),
      });

      const result = await standardService.createStandardInvoice(orderId, 1);

      expect(result.status).toBe('cleared');
      // When clearedXml is null, our signed XML is stored
      expect(result.signedXml).toContain('<Invoice');
      expect(result.signedXml).toContain('name="0100000"');
      expect(result.signedXml).toContain('399999999800003');

      // persisted xml should be our signed XML containing standard subtype
      const row = sqlite
        .prepare('SELECT xml FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row.xml).toContain('<Invoice');
      expect(row.xml).toContain('name="0100000"');
      expect(row.xml).toContain('399999999800003');
    });

    it('emits PaymentMeansCode 48 for a card-paid standard invoice', async () => {
      const orderId = createStandardOrder();
      sqlite.exec(`
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (${orderId}, 'card', 'Card', '48', 11500, ${now})
      `);

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearanceStatus: 'CLEARED' }),
      });

      const result = await standardService.createStandardInvoice(orderId, 1);
      expect(result.status).toBe('cleared');
      expect(result.signedXml.match(/<cac:PaymentMeans>/g)).toHaveLength(1);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
      expect(result.signedXml).not.toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
      expect(result.signedXml).toContain(
        '<cbc:InstructionNote>Card | 115.00 SAR</cbc:InstructionNote>',
      );
    });

    it('split-tender standard invoice emits one block per payment line', async () => {
      const orderId = createStandardOrder();
      sqlite.exec(`
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (${orderId}, 'cash', 'Cash', '10', 3000, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (${orderId}, 'card', 'Card', '48', 8500, ${now});
      `);

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearanceStatus: 'CLEARED' }),
      });

      const result = await standardService.createStandardInvoice(orderId, 1);
      expect(result.status).toBe('cleared');
      expect(result.signedXml.match(/<cac:PaymentMeans>/g)).toHaveLength(2);
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>48</cbc:PaymentMeansCode>');
      expect(result.signedXml).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
      expect(result.signedXml).toContain(
        '<cbc:InstructionNote>Card | 85.00 SAR</cbc:InstructionNote>',
      );
      expect(result.signedXml).toContain(
        '<cbc:InstructionNote>Cash | 30.00 SAR</cbc:InstructionNote>',
      );
      // 'card' < 'cash' → card block first
      expect(result.signedXml.indexOf('Card | 85.00 SAR')).toBeLessThan(
        result.signedXml.indexOf('Cash | 30.00 SAR'),
      );
    });

    it('persists with status rejected on clearance REJECTED (no throw, returns result)', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: {
            errorMessages: ['Invalid invoice structure'],
          },
        }),
      });

      // New behavior: no throw — returns result with status 'rejected'
      const result = await standardService.createStandardInvoice(orderId, 1);
      expect(result.status).toBe('rejected');
      expect(result.attemptNo).toBe(1);

      // But the row should still exist with status=rejected
      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('rejected');
      expect(row.reported_at).toBeNull();
      // Signed XML is stored, containing standard subtype
      expect(row.xml).toContain('<Invoice');
      expect(row.xml).toContain('name="0100000"');
    });

    it('persists with status error on clearance ERROR (no throw, returns result)', async () => {
      const orderId = createStandardOrder();

      // Simulate network error
      fakeHttp.nextError = new Error('Connection refused');

      // New behavior: no throw — returns result with status 'error'
      const result = await standardService.createStandardInvoice(orderId, 1);
      expect(result.status).toBe('error');
      expect(result.attemptNo).toBe(1);

      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row.status).toBe('error');
      expect(row.xml).toContain('<Invoice');
    });

    it('throws for order with is_standard_invoice=0', async () => {
      const orderId = createSimplifiedOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });

      await expect(standardService.createStandardInvoice(orderId, 1)).rejects.toThrow(
        /is not a standard invoice/,
      );
    });

    it('throws for order with missing buyer fields', async () => {
      orderSeq++;
      const uuid = `order-partial-uuid-${orderSeq}`;
      const orderNo = 300 + orderSeq;

      // Create an order with is_standard_invoice=1 but missing buyer fields
      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-18', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      const partialJson = JSON.stringify({
        name: 'Some Buyer',
        vatNumber: '399999999800009',
      });

      sqlite.exec(`
        INSERT INTO orders (
          order_no, uuid, type, day_opening_id, status,
          subtotal_halalas, vat_halalas, total_halalas,
          is_standard_invoice,
          zatca_buyer_details,
          document_id,
          created_at, updated_at
        ) VALUES (
          ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
          3000, 450, 3450,
          1,
          '${partialJson.replace(/'/g, "''")}',
          'TEST-PARTIAL-${orderSeq}',
          ${now}, ${now}
        )
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (${orderId}, 'Item', 3450, 1500, 1, 3450, ${now}, ${now})
      `);

      await expect(standardService.createStandardInvoice(orderId, 1)).rejects.toThrow(
        /missing or invalid/,
      );
    });

    it('does not expose buyer field values in validation error messages', async () => {
      orderSeq++;
      const uuid = `order-pii-uuid-${orderSeq}`;
      const orderNo = 301 + orderSeq;

      sqlite.exec(`
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-19', 'open', ${now}, 1, ${now}, ${now})
      `);
      const doId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      // Partial buyer with a specific VAT number that must not appear
      const partialJson = JSON.stringify({
        name: 'Secret Co',
        vatNumber: '399999999800010',
        street: 'Secret Address 123',
      });

      sqlite.exec(`
        INSERT INTO orders (
          order_no, uuid, type, day_opening_id, status,
          subtotal_halalas, vat_halalas, total_halalas,
          is_standard_invoice,
          zatca_buyer_details,
          document_id,
          created_at, updated_at
        ) VALUES (
          ${orderNo}, '${uuid}', 'dine_in', ${doId}, 'paid',
          3000, 450, 3450,
          1,
          '${partialJson.replace(/'/g, "''")}',
          'TEST-PII-${orderSeq}',
          ${now}, ${now}
        )
      `);
      const orderId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (${orderId}, 'Item', 3450, 1500, 1, 3450, ${now}, ${now})
      `);

      expect.assertions(3);
      try {
        await standardService.createStandardInvoice(orderId, 1);
      } catch (err: any) {
        expect(err.message).toContain('missing or invalid');
        // P1-004: buyer field values must not appear in the thrown message
        expect(err.message).not.toContain('399999999800010');
        expect(err.message).not.toContain('Secret Address 123');
      }
    });

    it('shares ICV chain with simplified invoices via allocateNextIcv', async () => {
      // First, create a simplified invoice to consume an ICV via allocateNextIcv
      const simpleOrderId = createSimplifiedOrder();

      printersService.setSetting('zatca_org_unit', TEST_ORG_UNIT);

      const simplifiedResult = await invoiceService.createInvoice(simpleOrderId);
      const simplifiedIcv = simplifiedResult.icv;

      // Now create standard order — should get the next ICV
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>cleared</Invoice>').toString('base64'),
        }),
      });

      const result = await standardService.createStandardInvoice(orderId, 1);

      // Standard invoice ICV should be exactly one greater than the simplified
      expect(result.icv).toBe(simplifiedIcv + 1);

      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row.icv).toBe(simplifiedIcv + 1);
      // PIH should point to the simplified invoice's hash
      expect(row.prev_invoice_hash).toBe(simplifiedResult.invoiceHash);
      expect(row.prev_invoice_hash).toBeTruthy();
      expect(row.prev_invoice_hash.length).toBe(44);
    });

    it('simplified XML builder regression check — defaults still produce simplified output', () => {
      // This verifies that the XML builder still produces the correct simplified
      // output when invoiceProfile is not set (default behavior).
      const { buildUnsignedInvoiceXML } = require('./zatca-xml-builder.service');
      const xml = buildUnsignedInvoiceXML({
        documentId: 'TEST-SIMPLE-REGRESS',
        icv: 1,
        uuid: 'test-uuid',
        issueDate: '2024-01-01',
        issueTime: '12:00:00',
        seller: {
          name: 'Test',
          vatNumber: '300123',
          street: 'Test St',
          buildingNumber: '1',
          city: 'Riyadh',
          postalCode: '12345',
          country: 'SA',
        },
        items: [{ name: 'Item', unitPriceHalalas: 11500, vatRateBp: 1500, qty: 1 }],
        prevInvoiceHash: '',
      });

      // Simplified subtype still 0200000
      expect(xml).toContain('name="0200000"');
      expect(xml).not.toContain('name="0100000"');
      // Empty customer party — AccountingCustomerParty should not have Party children
      expect(xml).toContain('<cac:AccountingCustomerParty>');
      // No Delivery for simplified invoice
      const deliveryIdx = xml.indexOf('<cac:Delivery>');
      expect(deliveryIdx).toBe(-1);
    });

    it('is idempotent — second call for same order returns existing row', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>first</Invoice>').toString('base64'),
        }),
      });

      const first = await standardService.createStandardInvoice(orderId, 1);
      expect(first.status).toBe('cleared');

      // Second call should return the existing row without calling clearance again
      const second = await standardService.createStandardInvoice(orderId, 1);
      expect(second.id).toBe(first.id);
      expect(second.icv).toBe(first.icv);
      expect(second.uuid).toBe(first.uuid);
      expect(second.status).toBe('cleared');

      // No additional clearance requests were made
      expect(fakeHttp.requests.length).toBe(1);
    });
  });

  // ── Helper: create a refund for a standard order ─────────────────────────

  let refundInvoiceSeq = 0;

  function createRefundForStandardOrder(orderId: number, opts?: { reason?: string }): number {
    refundInvoiceSeq++;
    const refundInvoiceId = `CN-TEST-${refundInvoiceSeq}`;
    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, document_id, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, ${opts?.reason ? `'${opts.reason}'` : 'NULL'}, '${refundInvoiceId}', ${now})
    `);
    const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    // Use the first order item from the order
    sqlite.exec(`
      INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
      VALUES (${refundId}, 'Office Supplies', 11500, 1500, 1, 11500, ${now})
    `);

    return refundId;
  }

  // ── createStandardCreditNote tests ───────────────────────────────────────

  describe('createStandardCreditNote', () => {
    it('creates standard credit note via clearance with buyer info from order', async () => {
      const orderId = createStandardOrder();

      // First create the invoice (sets up ICV)
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>cleared</Invoice>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      // Now refund
      const refundId = createRefundForStandardOrder(orderId, { reason: 'Wrong size' });

      const clearedXml = '<CreditNote>cleared_by_zatca</CreditNote>';
      const clearedB64 = Buffer.from(clearedXml).toString('base64');

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: clearedB64,
        }),
      });

      const result = await standardService.createStandardCreditNote(orderId, refundId, 1);

      // Read the invoice ICV for comparison (ICV accumulates across tests)
      const invoiceRow = sqlite
        .prepare('SELECT icv FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;

      expect(result.id).toBeGreaterThan(0);
      expect(result.icv).toBe(invoiceRow.icv + 1); // next ICV after the invoice
      expect(result.uuid).toBeTruthy();
      expect(result.status).toBe('cleared');

      // P1-001: full result shape — non-empty hash, QR, XML, real clearance info
      expect(result.invoiceHash).toBeTruthy();
      expect(result.invoiceHash.length).toBeGreaterThan(0);
      expect(result.qrTlvBase64).toBeTruthy();
      expect(result.qrTlvBase64.length).toBeGreaterThan(0);
      expect(result.signedXml).toBeTruthy();
      expect(result.signedXml.length).toBeGreaterThan(0);
      expect(result.clearance.status).toBe('CLEARED');
      expect(result.clearance.httpStatus).toBe(200);
      expect(result.clearance.clearedXml).not.toBeNull();

      // Verify DB row
      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('cleared');
      expect(row.related_invoice_uuid).toBeTruthy();
      expect(row.total_halalas).toBe(11500);
      expect(row.vat_halalas).toBe(1500);
      expect(row.reason).toBe('Wrong size');
      expect(row.xml).toBe(clearedXml);
      expect(row.reported_at).not.toBeNull();

      // XML content check — the signed XML that was submitted should be standard
      expect(fakeHttp.requests.length).toBe(1);
      const reqBody = JSON.parse(fakeHttp.requests[0].options.body);
      const submittedXml = Buffer.from(reqBody.invoice, 'base64').toString('utf8');
      expect(submittedXml).toContain('name="0100000"');
      expect(submittedXml).toContain('399999999800003'); // buyer VAT
      expect(submittedXml).toContain('BillingReference');
      expect(submittedXml).toContain('Wrong size');
    });

    it('persists with status rejected on clearance REJECTED (no throw)', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: {
            errorMessages: ['Invalid credit note structure'],
          },
        }),
      });

      // New behavior: no throw — returns result with status 'rejected'
      const result = await standardService.createStandardCreditNote(orderId, refundId, 1);
      expect(result.status).toBe('rejected');

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('rejected');
      expect(row.reported_at).toBeNull();
      expect(row.xml).toContain('name="0100000"');
    });

    it('persists with status error on clearance ERROR (no throw)', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.nextError = new Error('Connection refused');

      // New behavior: no throw — returns result
      const result = await standardService.createStandardCreditNote(orderId, refundId, 1);
      expect(result.status).toBe('error');

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(row.status).toBe('error');
      expect(row.xml).toContain('<Invoice');
    });

    it('uses "Refund" as default reason when refund reason is null', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId); // no reason

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote/>').toString('base64'),
        }),
      });

      await standardService.createStandardCreditNote(orderId, refundId, 1);

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(row.status).toBe('cleared');
      expect(row.reason).toBe('Refund');

      // Verify the XML contains the default reason
      const reqBody = JSON.parse(fakeHttp.requests[0]?.options.body ?? '{}');
      const submittedXml = Buffer.from(reqBody.invoice ?? '', 'base64').toString('utf8');
      expect(submittedXml).toContain(
        '<cbc:InstructionNote>Refund | Cash | 115.00 SAR</cbc:InstructionNote>',
      );
    });

    it('throws for simplified orders', async () => {
      const orderId = createSimplifiedOrder();

      // Create simplified invoice
      printersService.setSetting('zatca_org_unit', TEST_ORG_UNIT);
      await invoiceService.createInvoice(orderId);

      // Create refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 5000, 750, 5750, 'Test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
        VALUES (${refundId}, 'Burger', 5750, 1500, 1, 5750, ${now})
      `);

      await expect(standardService.createStandardCreditNote(orderId, refundId, 1)).rejects.toThrow(
        /No cleared original invoice found/,
      );
    });
  });

  // ── Phase 6 event routing tests ──────────────────────────────────────────

  describe('Phase 6 event routing', () => {
    it('onOrderPaid creates standard invoice for standard order', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>event</Invoice>').toString('base64'),
        }),
      });

      await standardService.onOrderPaid({ orderId, userId: 1 });

      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('cleared');
    });

    it('onOrderPaid skips simplified orders', async () => {
      const orderId = createSimplifiedOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });

      await standardService.onOrderPaid({ orderId, userId: 1 });

      // No invoice row, no HTTP requests
      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).toBeUndefined();
      expect(fakeHttp.requests.length).toBe(0);
    });

    it('onOrderPaid does not throw when clearance fails (payment remains committed)', async () => {
      const orderId = createStandardOrder();

      fakeHttp.nextError = new Error('Network down');

      // Must not throw
      await expect(standardService.onOrderPaid({ orderId, userId: 1 })).resolves.toBeUndefined();

      // Failed row persisted (now status='error' for network failures)
      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('error');
    });

    it('onOrderRefundIssued creates standard credit note for standard order', async () => {
      const orderId = createStandardOrder();

      // Create invoice first
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote/>').toString('base64'),
        }),
      });

      await standardService.onOrderRefundIssued({
        orderId,
        refundId,
        userId: 1,
      });

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('cleared');
    });

    it('onOrderRefundIssued skips simplified orders', async () => {
      const orderId = createSimplifiedOrder();

      // Create simplified invoice
      printersService.setSetting('zatca_org_unit', TEST_ORG_UNIT);
      await invoiceService.createInvoice(orderId);

      // Create refund
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 5000, 750, 5750, 'Test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      sqlite.exec(`
        INSERT INTO order_refund_items (refund_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
        VALUES (${refundId}, 'Burger', 5750, 1500, 1, 5750, ${now})
      `);

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote/>').toString('base64'),
        }),
      });

      await standardService.onOrderRefundIssued({
        orderId,
        refundId,
        userId: 1,
      });

      // No standard credit note row, no clearance HTTP requests
      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ? AND status = ?')
        .get(refundId, 'cleared') as any;
      expect(row).toBeUndefined();
      expect(fakeHttp.requests.length).toBe(0);
    });

    it('onOrderRefundIssued does not throw when clearance fails (refund remains committed)', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.nextError = new Error('Network down during refund');

      await expect(
        standardService.onOrderRefundIssued({ orderId, refundId, userId: 1 }),
      ).resolves.toBeUndefined();

      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE refund_id = ?')
        .get(refundId) as any;
      expect(row).not.toBeUndefined();
      expect(row.status).toBe('error');
    });
  });

  // ── Multi-attempt lifecycle tests ───────────────────────────────────────

  describe('multi-attempt clearance lifecycle', () => {
    it('reject → reissue burns new ICV and new UUID, first row stays rejected', async () => {
      const orderId = createStandardOrder();

      // First attempt: REJECTED
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: {
            errorMessages: ['Invalid invoice structure'],
          },
        }),
      });

      const first = await standardService.createStandardInvoice(orderId, 1);
      expect(first.status).toBe('rejected');
      expect(first.attemptNo).toBe(1);
      const firstIcv = first.icv;
      const firstUuid = first.uuid;

      fakeHttp.requests = [];

      // Now reissue — should create attemptNo=2 with new ICV
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>reissued_cleared</Invoice>').toString('base64'),
        }),
      });

      const reissued = await standardService.reissue(orderId, 1);
      expect(reissued.status).toBe('cleared');
      expect(reissued.attemptNo).toBe(2);
      expect(reissued.icv).toBe(firstIcv + 1);
      expect(reissued.uuid).not.toBe(firstUuid);

      // First row is still rejected and immutable
      const firstRow = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE id = ?')
        .get(first.id) as any;
      expect(firstRow.status).toBe('rejected');
      expect(firstRow.icv).toBe(firstIcv);
      expect(firstRow.uuid).toBe(firstUuid);

      // Second row cleared
      const secondRow = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE id = ?')
        .get(reissued.id) as any;
      expect(secondRow.status).toBe('cleared');
      expect(secondRow.attempt_no).toBe(2);
      expect(secondRow.icv).toBe(firstIcv + 1);
      expect(secondRow.uuid).not.toBe(firstUuid);
    });

    it('retryClearance after error keeps same ICV and UUID', async () => {
      const orderId = createStandardOrder();

      // First attempt: ERROR (network)
      fakeHttp.nextError = new Error('Connection refused');
      const first = await standardService.createStandardInvoice(orderId, 1);
      expect(first.status).toBe('error');
      const firstIcv = first.icv;
      const firstUuid = first.uuid;

      fakeHttp.requests = [];
      fakeHttp.nextError = null;

      // Retry with success
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>retry_cleared</Invoice>').toString('base64'),
        }),
      });

      const retried = await standardService.retryClearance(orderId, 1);
      expect(retried.status).toBe('cleared');
      // Same ICV and UUID — we resubmitted the same payload
      expect(retried.icv).toBe(firstIcv);
      expect(retried.uuid).toBe(firstUuid);

      // Only one row for this order — updated in place
      const row = sqlite.prepare('SELECT * FROM zatca_invoices WHERE id = ?').get(first.id) as any;
      expect(row.status).toBe('cleared');
      expect(row.icv).toBe(firstIcv);
      expect(row.uuid).toBe(firstUuid);
    });

    it('getInvoiceStatus returns correct canReissue only for rejected', async () => {
      const orderId = createStandardOrder();

      // Before any attempt: no invoice
      const status0 = standardService.getInvoiceStatus(orderId);
      expect(status0.invoiceType).toBe('standard');
      expect(status0.current).toBeNull();
      expect(status0.canReissue).toBe(false);
      expect(status0.canRetryClearance).toBe(false);

      // Create with rejected
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Invalid buyer'] },
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);

      const status1 = standardService.getInvoiceStatus(orderId);
      expect(status1.current?.status).toBe('rejected');
      expect(status1.canReissue).toBe(true);
      expect(status1.canRetryClearance).toBe(false);

      // After reissue with error
      fakeHttp.requests = [];
      fakeHttp.responses.delete('clearance');
      fakeHttp.nextError = new Error('Network error on reissue');

      await standardService.reissue(orderId, 1);

      const status2 = standardService.getInvoiceStatus(orderId);
      // Latest is error — canRetry but not canReissue
      expect(status2.current?.status).toBe('error');
      expect(status2.canReissue).toBe(false);
      expect(status2.canRetryClearance).toBe(true);
    });

    it('reissue throws when latest status is not rejected', async () => {
      const orderId = createStandardOrder();

      // Create with error
      fakeHttp.nextError = new Error('Network error');
      await standardService.createStandardInvoice(orderId, 1);

      fakeHttp.requests = [];
      fakeHttp.nextError = null;

      // reissue on error should throw
      await expect(standardService.reissue(orderId, 1)).rejects.toThrow(
        /Cannot reissue.*not 'rejected'/,
      );
    });

    it('reissue throws when already cleared', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);

      await expect(standardService.reissue(orderId, 1)).rejects.toThrow(
        /already has a cleared invoice/,
      );
    });

    it('retryClearance throws when latest status is not error', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);

      await expect(standardService.retryClearance(orderId, 1)).rejects.toThrow(
        /Cannot retry.*not 'error'/,
      );
    });

    it('reissue updates buyer details on the order and creates a new attempt', async () => {
      const orderId = createStandardOrder();

      // First rejection
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Wrong buyer'] },
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);

      fakeHttp.requests = [];
      fakeHttp.responses.delete('clearance');

      // Reissue with updated buyer
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>updated</Invoice>').toString('base64'),
        }),
      });

      const updatedBuyer = {
        name: 'Updated Company',
        vatNumber: '399999999800004',
        street: 'New Street',
        buildingNumber: '2222',
        citySubdivision: 'Al-Malaz',
        city: 'Riyadh',
        postalCode: '12223',
        country: 'SA',
      };

      const result = await standardService.reissue(orderId, 1, updatedBuyer);
      expect(result.status).toBe('cleared');
      expect(result.attemptNo).toBe(2);

      // Verify buyer was updated on the order
      const order = sqlite.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
      const persistedBuyer = JSON.parse(order.zatca_buyer_details);
      expect(persistedBuyer.name).toBe('Updated Company');
      expect(persistedBuyer.vatNumber).toBe('399999999800004');
    });
  });

  // ── Credit note lifecycle tests ────────────────────────────────────────

  describe('credit note lifecycle (getCreditNoteStatus / retry / reissue)', () => {
    it('getCreditNoteStatus returns standard type with current=null when no credit note exists', () => {
      const orderId = createStandardOrder();

      // Inline refund for this test
      sqlite.exec(`
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, reason, created_at)
        VALUES (${orderId}, 1, 'cash', 'Cash', '10', 10000, 1500, 11500, 'Test', ${now})
      `);
      const refundId = (sqlite.prepare('SELECT last_insert_rowid() as id').get() as any).id;

      const status = standardService.getCreditNoteStatus(orderId, refundId);
      expect(status.invoiceType).toBe('standard');
      expect(status.current).toBeNull();
      expect(status.attempts).toHaveLength(0);
      expect(status.canRetryClearance).toBe(false);
      expect(status.canReissue).toBe(false);
    });

    it('getCreditNoteStatus returns rejected current and canReissue=true after rejection', async () => {
      const orderId = createStandardOrder();

      // Create invoice first
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      // Reject credit note
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Invalid structure'] },
        }),
      });

      await standardService.createStandardCreditNote(orderId, refundId, 1);

      const status = standardService.getCreditNoteStatus(orderId, refundId);
      expect(status.current?.status).toBe('rejected');
      expect(status.canReissue).toBe(true);
      expect(status.canRetryClearance).toBe(false);
    });

    it('retryCreditNoteClearance works when latest is error', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      // First attempt: error
      fakeHttp.nextError = new Error('Network error');
      const first = await standardService.createStandardCreditNote(orderId, refundId, 1);
      expect(first.status).toBe('error');
      const firstIcv = first.icv;
      const firstUuid = first.uuid;

      fakeHttp.requests = [];
      fakeHttp.nextError = null;

      // Retry with success
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote>retry_cleared</CreditNote>').toString('base64'),
        }),
      });

      const retried = await standardService.retryCreditNoteClearance(orderId, refundId, 1);
      expect(retried.status).toBe('cleared');
      // Same ICV and UUID — resubmitted the same payload
      expect(retried.icv).toBe(firstIcv);
      expect(retried.uuid).toBe(firstUuid);

      // DB row updated in place
      const row = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE id = ?')
        .get(first.id) as any;
      expect(row.status).toBe('cleared');
      expect(row.icv).toBe(firstIcv);
      expect(row.uuid).toBe(firstUuid);
    });

    it('retryCreditNoteClearance throws when latest is not error', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote/>').toString('base64'),
        }),
      });
      await standardService.createStandardCreditNote(orderId, refundId, 1);

      await expect(standardService.retryCreditNoteClearance(orderId, refundId, 1)).rejects.toThrow(
        /Cannot retry.*not 'error'/,
      );
    });

    it('reissueCreditNote creates new attempt with new ICV after rejection', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      // First attempt: rejected
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Invalid structure'] },
        }),
      });

      const first = await standardService.createStandardCreditNote(orderId, refundId, 1);
      expect(first.status).toBe('rejected');
      expect(first.attemptNo).toBe(1);
      const firstIcv = first.icv;
      const firstUuid = first.uuid;

      fakeHttp.requests = [];

      // Reissue with success
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote>reissued</CreditNote>').toString('base64'),
        }),
      });

      const reissued = await standardService.reissueCreditNote(orderId, refundId, 1);
      expect(reissued.status).toBe('cleared');
      expect(reissued.attemptNo).toBe(2);
      expect(reissued.icv).toBe(firstIcv + 1);
      expect(reissued.uuid).not.toBe(firstUuid);

      // P1-001: full result shape — non-empty hash, QR, XML, real clearance info
      expect(reissued.invoiceHash).toBeTruthy();
      expect(reissued.invoiceHash.length).toBeGreaterThan(0);
      expect(reissued.qrTlvBase64).toBeTruthy();
      expect(reissued.qrTlvBase64.length).toBeGreaterThan(0);
      expect(reissued.signedXml).toBeTruthy();
      expect(reissued.signedXml.length).toBeGreaterThan(0);
      expect(reissued.clearance.status).toBe('CLEARED');
      expect(reissued.clearance.httpStatus).toBe(200);
      expect(reissued.clearance.clearedXml).not.toBeNull();

      // First row still rejected
      const firstRow = sqlite
        .prepare('SELECT * FROM zatca_credit_notes WHERE id = ?')
        .get(first.id) as any;
      expect(firstRow.status).toBe('rejected');
      expect(firstRow.icv).toBe(firstIcv);
    });

    it('reissueCreditNote throws when already cleared', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<CreditNote/>').toString('base64'),
        }),
      });
      await standardService.createStandardCreditNote(orderId, refundId, 1);

      await expect(standardService.reissueCreditNote(orderId, refundId, 1)).rejects.toThrow(
        /already has a cleared credit note/,
      );
    });

    it('reissueCreditNote throws when latest is not rejected', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      // Error, not rejected
      fakeHttp.nextError = new Error('Network error');
      await standardService.createStandardCreditNote(orderId, refundId, 1);

      fakeHttp.requests = [];
      fakeHttp.nextError = null;

      await expect(standardService.reissueCreditNote(orderId, refundId, 1)).rejects.toThrow(
        /Cannot reissue.*not 'rejected'/,
      );
    });
  });

  // ── Burn event tests ─────────────────────────────────────────────────────

  describe('zatca_clearance_rejected order_events', () => {
    // Helper to count zatca_clearance_rejected events for an order
    function getBurnEventsCount(orderId: number): number {
      // Use named parameter to avoid any positional binding ambiguity
      const row = sqlite
        .prepare(
          "SELECT COUNT(*) as cnt FROM order_events WHERE order_id = $oid AND type = 'zatca_clearance_rejected'",
        )
        .get({ oid: orderId }) as any;
      return row.cnt;
    }

    function getBurnEvents(orderId: number): any[] {
      return sqlite
        .prepare(
          "SELECT * FROM order_events WHERE order_id = $oid AND type = 'zatca_clearance_rejected' ORDER BY event_idx",
        )
        .all({ oid: orderId });
    }

    it('writes burn event on invoice HTTP 400 → rejected', async () => {
      const orderId = createStandardOrder();

      // Count total burn events before
      const beforeCount = (
        sqlite
          .prepare(
            "SELECT COUNT(*) as cnt FROM order_events WHERE type = 'zatca_clearance_rejected'",
          )
          .get() as any
      ).cnt as number;

      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: {
            errorMessages: ['Invalid invoice structure'],
          },
        }),
      });

      await standardService.createStandardInvoice(orderId, 1);

      // Count total burn events after
      const afterCount = (
        sqlite
          .prepare(
            "SELECT COUNT(*) as cnt FROM order_events WHERE type = 'zatca_clearance_rejected'",
          )
          .get() as any
      ).cnt as number;

      // Exactly one new burn event should have been created
      expect(afterCount).toBe(beforeCount + 1);

      // Invoice row stays rejected, ICV burned
      const row = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .get(orderId) as any;
      expect(row.status).toBe('rejected');
      // ICV is accumulated across tests; just verify it's positive
      expect(row.icv).toBeGreaterThan(0);
    });

    it('HTTP 500 → error, NO burn event, ICV unchanged on retryClearance success', async () => {
      const orderId = createStandardOrder();

      // First attempt: 500 → error
      fakeHttp.responses.set('clearance', {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ errors: ['Internal server error'] }),
      });

      const first = await standardService.createStandardInvoice(orderId, 1);
      expect(first.status).toBe('error');
      const firstIcv = first.icv;
      const firstUuid = first.uuid;

      // No burn event for error
      expect(getBurnEventsCount(orderId)).toBe(0);

      // Retry with success — same ICV
      fakeHttp.requests = [];
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>retry_cleared</Invoice>').toString('base64'),
        }),
      });

      const retried = await standardService.retryClearance(orderId, 1);
      expect(retried.status).toBe('cleared');
      expect(retried.icv).toBe(firstIcv);
      expect(retried.uuid).toBe(firstUuid);

      // Still no burn event
      expect(getBurnEventsCount(orderId)).toBe(0);
    });

    it('createStandardInvoice when latest is error does NOT allocate new ICV', async () => {
      const orderId = createStandardOrder();

      // First attempt: error
      fakeHttp.nextError = new Error('Connection refused');
      const first = await standardService.createStandardInvoice(orderId, 1);
      expect(first.status).toBe('error');
      const firstIcv = first.icv;
      const firstId = first.id;

      fakeHttp.requests = [];
      fakeHttp.nextError = null;

      // Second call with fake success — but should return existing error row
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });

      const second = await standardService.createStandardInvoice(orderId, 1);
      // Should return existing error, not make a new call
      expect(second.id).toBe(firstId);
      expect(second.status).toBe('error');
      expect(second.icv).toBe(firstIcv);

      // No new clearance requests, no new ICV
      expect(fakeHttp.requests.length).toBe(0);

      // Only 1 row
      const rows = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE order_id = ?')
        .all(orderId) as any[];
      expect(rows.length).toBe(1);
    });

    it('reissue after reject → new ICV; first row stays rejected; second attempt can also reject and write second burn event', async () => {
      const orderId = createStandardOrder();

      // First attempt: 400 → rejected
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Invalid buyer'] },
        }),
      });
      const first = await standardService.createStandardInvoice(orderId, 1);
      expect(first.status).toBe('rejected');
      const firstIcv = first.icv;

      // First burn event
      expect(getBurnEventsCount(orderId)).toBe(1);
      const firstBurnPayload = JSON.parse(getBurnEvents(orderId)[0].payload);
      expect(firstBurnPayload.icv).toBe(firstIcv);

      fakeHttp.requests = [];

      // Reissue: second attempt also rejected
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Still invalid'] },
        }),
      });
      const reissued = await standardService.reissue(orderId, 1);
      expect(reissued.status).toBe('rejected');
      expect(reissued.attemptNo).toBe(2);
      expect(reissued.icv).toBe(firstIcv + 1);

      // Second burn event
      const secondBurnEvents = getBurnEvents(orderId);
      expect(secondBurnEvents.length).toBe(2);

      const payload2 = JSON.parse(secondBurnEvents[1].payload);
      expect(payload2.documentKind).toBe('invoice');
      expect(payload2.icv).toBe(firstIcv + 1);
      expect(payload2.attemptNo).toBe(2);

      // First row still rejected
      const firstRow = sqlite
        .prepare('SELECT * FROM zatca_invoices WHERE id = ?')
        .get(first.id) as any;
      expect(firstRow.status).toBe('rejected');
    });

    it('credit note reject writes burn event with documentKind credit_note and refundId', async () => {
      const orderId = createStandardOrder();

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice/>').toString('base64'),
        }),
      });
      await standardService.createStandardInvoice(orderId, 1);
      fakeHttp.requests = [];

      const refundId = createRefundForStandardOrder(orderId);

      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: { errorMessages: ['Invalid credit note'] },
        }),
      });

      await standardService.createStandardCreditNote(orderId, refundId, 1);

      const events = getBurnEvents(orderId);
      expect(events.length).toBe(1);

      const payload = JSON.parse(events[0].payload);
      expect(payload.documentKind).toBe('credit_note');
      expect(payload.orderId).toBe(orderId);
      expect(payload.refundId).toBe(refundId);
      expect(payload.icv).toBeGreaterThan(0);
      // cbcId is the refund's document_id (not icv). Verify it's a non-empty string.
      expect(typeof payload.cbcId).toBe('string');
      expect(payload.cbcId.length).toBeGreaterThan(0);
    });
  });
});
