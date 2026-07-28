/**
 * ZATCA Clearance Service — Unit Tests
 *
 * Tests the synchronous clearance API client using an in-memory SQLite DB,
 * a NestJS test module, and a Fake HTTP client.
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
import { ZatcaClearanceService } from './zatca-clearance.service';
import { FakeZatcaHttpClient, ZatcaHttpService } from './zatca-http.service';
import { zatcaKey } from '@spicyhome/shared';

describe('ZatcaClearanceService', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let clearanceService: ZatcaClearanceService;
  let printersService: PrintersService;
  let fakeHttp: FakeZatcaHttpClient;
  const TEST_ORG_UNIT = 'SpicyHome POS';

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // Apply migrations
    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db');
    const migrationsDir = findMigrationsDir();
    applyMigrations(sqlite, migrationsDir);

    const now = Math.floor(Date.now() / 1000);

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

    db = drizzle(sqlite, { schema });
    fakeHttp = new FakeZatcaHttpClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), DatabaseModule, PrintersModule],
      providers: [ZatcaClearanceService, ZatcaHttpService],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .overrideProvider(ZatcaHttpService)
      .useValue(fakeHttp)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    clearanceService = app.get(ZatcaClearanceService);
    printersService = app.get(PrintersService);
  });

  afterAll(async () => {
    sqlite.close();
  });

  beforeEach(() => {
    // Reset fake HTTP state between tests
    fakeHttp.requests = [];
    fakeHttp.responses.clear();
    fakeHttp.nextError = null;

    // Reset credentials to compliance defaults
    printersService.setSetting('zatca_org_unit', TEST_ORG_UNIT);
    printersService.setSetting(
      'zatca_api_base_url',
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
    );
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'),
      'ZmFrZS1jZXJ0', // base64("fake-cert")
    );
    printersService.setSetting(
      zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'),
      'ZmFrZS1zZWNyZXQ=', // base64("fake-secret")
    );
    // Clear production credentials
    printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'production_cert'), '');
    printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'production_secret'), '');
  });

  // ── Input data ───────────────────────────────────────────────────────────

  const sampleInput = {
    invoiceHash: 'YWJjZGVmZzEyMzQ1Ng==',
    uuid: '123e4567-e89b-12d3-a456-426614174000',
    xml: '<Invoice>test</Invoice>',
  };

  // ── Tests ────────────────────────────────────────────────────────────────

  describe('clearDocument', () => {
    it('returns CLEARED for HTTP 200 with clearanceStatus CLEARED and clearedInvoice', async () => {
      const clearedXml = '<Invoice>cleared</Invoice>';
      const clearedInvoiceBase64 = Buffer.from(clearedXml).toString('base64');

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: clearedInvoiceBase64,
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('CLEARED');
      expect(result.httpStatus).toBe(200);
      expect(result.clearedXml).toBe(clearedXml);
      expect(result.clearedInvoiceBase64).toBe(clearedInvoiceBase64);
      expect(result.errors).toEqual([]);

      // Verify request details
      expect(fakeHttp.requests.length).toBe(1);
      const req = fakeHttp.requests[0];
      expect(req.method).toBe('POST');
      expect(req.url).toContain('/invoices/clearance/single');
      expect(req.options.headers['Clearance-Status']).toBe('1');
      expect(req.options.headers['Content-Type']).toBe('application/json');
      expect(req.options.headers['Accept-Version']).toBe('V2');

      // Verify body shape
      const body = JSON.parse(req.options.body);
      expect(body.invoiceHash).toBe(sampleInput.invoiceHash);
      expect(body.uuid).toBe(sampleInput.uuid);
      expect(body.invoice).toBe(Buffer.from(sampleInput.xml).toString('base64'));
      expect(body.invoice).toBe(Buffer.from('<Invoice>test</Invoice>').toString('base64'));
    });

    it('returns CLEARED for HTTP 202 without explicit clearanceStatus but with clearedInvoice', async () => {
      const clearedXml = '<Invoice>accepted</Invoice>';
      const clearedInvoiceBase64 = Buffer.from(clearedXml).toString('base64');

      fakeHttp.responses.set('clearance', {
        status: 202,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearedInvoice: clearedInvoiceBase64,
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('CLEARED');
      expect(result.httpStatus).toBe(202);
      expect(result.clearedXml).toBe(clearedXml);
    });

    it('returns CLEARED for HTTP 200 without explicit clearanceStatus or clearedInvoice (ambiguous success)', async () => {
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'SUCCESS' }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('CLEARED');
      expect(result.httpStatus).toBe(200);
      expect(result.clearedXml).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('extracts warnings from validationResults.warningMessages on 202', async () => {
      fakeHttp.responses.set('clearance', {
        status: 202,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>ok</Invoice>').toString('base64'),
          validationResults: {
            warningMessages: [
              'QR code format is non-standard',
              { message: 'Minor schema deviation' },
            ],
          },
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('CLEARED');
      expect(result.httpStatus).toBe(202);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings).toContain('QR code format is non-standard');
      expect(result.warnings).toContain('Minor schema deviation');
      expect(result.errors).toEqual([]);
    });

    it('extracts warnings from top-level warnings array', async () => {
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>ok</Invoice>').toString('base64'),
          warnings: ['Warning A', { message: 'Warning B' }],
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('CLEARED');
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings).toContain('Warning A');
      expect(result.warnings).toContain('Warning B');
    });

    it('returns REJECTED for HTTP 400 with validation errors', async () => {
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: {
            errorMessages: ['Invalid invoice structure', { message: 'Missing required field' }],
          },
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(400);
      expect(result.clearedXml).toBeNull();
      expect(result.clearedInvoiceBase64).toBeNull();
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Invalid invoice structure');
      expect(result.errors).toContain('Missing required field');
    });

    it('returns REJECTED for HTTP 200 with clearanceStatus NOT_CLEARED and no clearedInvoice', async () => {
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'NOT_CLEARED',
          validationResults: {
            errorMessages: ['Invoice does not meet clearance requirements'],
          },
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(200);
      expect(result.clearedXml).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns REJECTED for HTTP 500 with errors top-level array', async () => {
      fakeHttp.responses.set('clearance', {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          errors: ['Internal server error'],
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(500);
      expect(result.clearedXml).toBeNull();
      expect(result.errors).toContain('Internal server error');
    });

    it('returns REJECTED for HTTP 400 with JSON message field', async () => {
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Bad request' }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(400);
      expect(result.errors).toContain('Bad request');
    });

    it('returns REJECTED for HTTP 400 with JSON errorMessage field', async () => {
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ errorMessage: 'Something went wrong' }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(400);
      expect(result.errors).toContain('Something went wrong');
    });

    it('returns REJECTED for HTTP 400 with non-JSON body', async () => {
      fakeHttp.responses.set('clearance', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
        body: 'Plain text error',
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(400);
      expect(result.errors).toEqual(['Plain text error']);
      expect(result.rawBody).toBe('Plain text error');
    });

    it('returns NO_CREDENTIALS when neither compliance nor production cert/secret are set', async () => {
      // Clear all credentials
      printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_cert'), '');
      printersService.setSetting(zatcaKey('simulation', TEST_ORG_UNIT, 'compliance_secret'), '');

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('NO_CREDENTIALS');
      expect(result.httpStatus).toBe(0);
      expect(result.clearedXml).toBeNull();

      // No HTTP requests should have been made
      expect(fakeHttp.requests.length).toBe(0);
    });

    it('returns ERROR for network errors without throwing', async () => {
      fakeHttp.nextError = new Error('Connection timeout');

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('ERROR');
      expect(result.httpStatus).toBe(0);
      expect(result.clearedXml).toBeNull();
      expect(result.errors).toEqual(['Connection timeout']);
      expect(result.rawBody).toBeNull();
    });

    it('uses production credentials when both production and compliance are present', async () => {
      // Set production credentials
      printersService.setSetting(
        zatcaKey('simulation', TEST_ORG_UNIT, 'production_cert'),
        'cHJvZC1jZXJ0', // base64("prod-cert")
      );
      printersService.setSetting(
        zatcaKey('simulation', TEST_ORG_UNIT, 'production_secret'),
        'cHJvZC1zZWNyZXQ=', // base64("prod-secret")
      );

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>prod</Invoice>').toString('base64'),
        }),
      });

      await clearanceService.clearDocument(sampleInput);

      expect(fakeHttp.requests.length).toBe(1);
      const req = fakeHttp.requests[0];
      expect(req.options.auth).toBeDefined();
      expect(req.options.auth.username).toBe('cHJvZC1jZXJ0');
      expect(req.options.auth.password).toBe('cHJvZC1zZWNyZXQ=');
    });

    it('falls back to compliance credentials when only compliance is present', async () => {
      // Ensure production is empty (already done in beforeEach)
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'CLEARED',
          clearedInvoice: Buffer.from('<Invoice>compliance</Invoice>').toString('base64'),
        }),
      });

      await clearanceService.clearDocument(sampleInput);

      expect(fakeHttp.requests.length).toBe(1);
      const req = fakeHttp.requests[0];
      expect(req.options.auth).toBeDefined();
      expect(req.options.auth.username).toBe('ZmFrZS1jZXJ0');
      expect(req.options.auth.password).toBe('ZmFrZS1zZWNyZXQ=');
    });

    it('request body invoice field is base64-encoded input xml', async () => {
      const customXml = '<Invoice><UBLVersionID>2.1</UBLVersionID></Invoice>';
      const expectedB64 = Buffer.from(customXml).toString('base64');

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearanceStatus: 'CLEARED', clearedInvoice: expectedB64 }),
      });

      await clearanceService.clearDocument({
        invoiceHash: 'aGFzaA==',
        uuid: 'uuid-1',
        xml: customXml,
      });

      expect(fakeHttp.requests.length).toBe(1);
      const body = JSON.parse(fakeHttp.requests[0].options.body);
      expect(body.invoice).toBe(expectedB64);
    });

    it('request headers include Clearance-Status: 1 not 0', async () => {
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearanceStatus: 'CLEARED', clearedInvoice: 'dummy' }),
      });

      await clearanceService.clearDocument(sampleInput);

      expect(fakeHttp.requests.length).toBe(1);
      const headers = fakeHttp.requests[0].options.headers;
      expect(headers['Clearance-Status']).toBe('1');
      // Ensure it's not reporting's value
      expect(headers['Clearance-Status']).not.toBe('0');
    });

    it('returns rawBody in result for debugging', async () => {
      const responseBody = JSON.stringify({
        clearanceStatus: 'CLEARED',
        clearedInvoice: 'dGVzdA==',
      });

      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: responseBody,
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.rawBody).toBe(responseBody);
    });

    it('handles HTTP 202 with warnings but no clearedInvoice (non-CLEARED explicit status)', async () => {
      fakeHttp.responses.set('clearance', {
        status: 202,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clearanceStatus: 'PARTIALLY_CLEARED',
          validationResults: {
            warningMessages: ['Some issues detected'],
            errorMessages: ['Invoice needs review'],
          },
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      // Unclear status with errors → REJECTED
      expect(result.status).toBe('REJECTED');
      expect(result.httpStatus).toBe(202);
      expect(result.clearedXml).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('treats HTTP 200 with errors and no clearedInvoice as REJECTED', async () => {
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          validationResults: {
            errorMessages: ['Schema validation failed'],
          },
        }),
      });

      const result = await clearanceService.clearDocument(sampleInput);

      expect(result.status).toBe('REJECTED');
      expect(result.errors).toContain('Schema validation failed');
      expect(result.clearedXml).toBeNull();
    });

    it('handles unparseable JSON body on success HTTP status gracefully', async () => {
      fakeHttp.responses.set('clearance', {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
      });

      const result = await clearanceService.clearDocument(sampleInput);

      // Ambiguous 200 without parseable body → CLEARED (graceful fallback)
      expect(result.status).toBe('CLEARED');
      expect(result.httpStatus).toBe(200);
      expect(result.clearedXml).toBeNull();
    });

    it('uses configurable API base URL from settings', async () => {
      printersService.setSetting('zatca_api_base_url', 'https://custom-zatca.example.com/api');

      fakeHttp.responses.set('custom-zatca', {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clearanceStatus: 'CLEARED', clearedInvoice: 'dGVzdA==' }),
      });

      await clearanceService.clearDocument(sampleInput);

      expect(fakeHttp.requests.length).toBe(1);
      expect(fakeHttp.requests[0].url).toContain('https://custom-zatca.example.com/api');
      expect(fakeHttp.requests[0].url).toContain('/invoices/clearance/single');
    });
  });
});
