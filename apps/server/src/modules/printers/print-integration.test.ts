import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { AppModule } from '../../app.module';
import { DRIZZLE } from '../../modules/database/database.module';
import { FakePrinterTransport } from '../../modules/printers/printer-transport';
import { PrintersService } from '../../modules/printers/printers.service';

let app: INestApplication;
let sqlite: any;
let db: any;
let jwtToken: string;
let transport: FakePrinterTransport;
let receiptPrinterId: number;
let kitchenPrinterId: number;
let burgerCategoryId: number;
let drinksCategoryId: number;
let zingerItemId: number;
let pepsiItemId: number;

beforeAll(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DRIZZLE)
    .useValue(db)
    .compile();

  app = moduleFixture.createNestApplication();
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  // Inject fake transport
  transport = new FakePrinterTransport();
  const ps = app.get(PrintersService);
  ps.setTransport(transport);

  const now = Math.floor(Date.now() / 1000);

  // Seed: receipt printer
  sqlite.exec(`
    INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
    VALUES (1, 'Counter', '192.168.1.50', 9100, 'receipt', 1, ${now}, ${now});
  `);
  receiptPrinterId = 1;

  // Seed: kitchen printer
  sqlite.exec(`
    INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
    VALUES (2, 'Kitchen', '192.168.1.51', 9100, 'kitchen', 1, ${now}, ${now});
  `);
  kitchenPrinterId = 2;

  // Seed: second kitchen printer for cold station
  sqlite.exec(`
    INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
    VALUES (3, 'Cold Station', '192.168.1.52', 9100, 'kitchen', 1, ${now}, ${now});
  `);

  // Seed: categories with printer routing
  sqlite.exec(`
    INSERT INTO item_categories (id, name, sort_order, printer_id, is_active, created_at, updated_at)
    VALUES (1, 'Burgers', 0, ${kitchenPrinterId}, 1, ${now}, ${now});
  `);
  burgerCategoryId = 1;

  sqlite.exec(`
    INSERT INTO item_categories (id, name, sort_order, printer_id, is_active, created_at, updated_at)
    VALUES (2, 'Drinks', 0, 3, 1, ${now}, ${now});
  `);
  drinksCategoryId = 2;

  // Seed: items
  sqlite.exec(`
    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (1, ${burgerCategoryId}, 'Zinger Burger', 2300, 1500, 0, 1, ${now}, ${now});
  `);
  zingerItemId = 1;

  sqlite.exec(`
    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (2, ${drinksCategoryId}, 'Pepsi', 575, 1500, 0, 1, ${now}, ${now});
  `);
  pepsiItemId = 2;

  // Seed: table
  sqlite.exec(`
    INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'T4', 0, 1, ${now}, ${now});
  `);

  // Seed: settings
  sqlite.exec(`
    INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
    INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789');
  `);

  // Login
  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username: 'admin', pin: '1234' });
  jwtToken = loginRes.body.accessToken;

  // Open business day (required for order creation)
  await request(app.getHttpServer())
    .post('/day/open')
    .set('Authorization', `Bearer ${jwtToken}`)
    .send({ openingCashHalalas: 50000 });
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe('Print Integration', () => {
  describe('order send → kitchen printing', () => {
    it('routes items to the correct kitchen printers by category', async () => {
      // Create order
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'dine_in', tableId: 1 })
        .expect(201);
      const orderId = orderRes.body.id;

      // Add burger item (→ kitchen printer 2)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: zingerItemId, qty: 2 })
        .expect(201);

      // Add drink item (→ cold station printer 3)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: pepsiItemId, qty: 1 })
        .expect(201);

      // Clear transport log
      transport.sent = [];

      // Send order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      // Non-blocking: give event a moment to process
      await new Promise((r) => setTimeout(r, 200));

      // Should have printed to 2 different kitchen printers
      const kitchenPrinters = transport.sent.filter((s) => s.ip !== '192.168.1.50'); // exclude receipt
      // We expect at least 2 kitchen prints (one per category)
      expect(kitchenPrinters.length).toBeGreaterThanOrEqual(2);

      // Verify kitchen ticket content for burger
      const burgerPrint = kitchenPrinters.find((s) =>
        s.data.toString('ascii').includes('Zinger Burger'),
      );
      expect(burgerPrint).toBeDefined();
      expect(burgerPrint!.data.toString('ascii')).toContain('2 Zinger Burger');
      expect(burgerPrint!.data.toString('ascii')).toContain(`ORDER #${orderRes.body.orderNo}`);

      // Verify kitchen ticket content for pepsi
      const pepsiPrint = kitchenPrinters.find((s) => s.data.toString('ascii').includes('Pepsi'));
      expect(pepsiPrint).toBeDefined();
    });

    it('order send succeeds even when printer is unreachable', async () => {
      transport.nextError = new Error('Connection refused');

      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: zingerItemId, qty: 1 })
        .expect(201);

      transport.sent = [];

      // Send should still succeed — print failure doesn't break order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      await new Promise((r) => setTimeout(r, 200));
    });
  });

  describe('order pay → receipt printing', () => {
    it('prints receipt with drawer kick on pay', async () => {
      // Create order
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'dine_in', tableId: 1 })
        .expect(201);
      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: zingerItemId, qty: 2 })
        .expect(201);

      // Send order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Pay order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      await new Promise((r) => setTimeout(r, 200));

      // Should have receipt print
      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);

      const receiptBuf = receiptPrints[0].data;
      const hex = receiptBuf.toString('hex');

      // Should have cash drawer kick (ESC p)
      expect(hex).toContain('1b70');

      // Should have receipt content
      const str = receiptBuf.toString('ascii');
      expect(str).toContain('SpicyHome');
      expect(str).toContain('VAT: 300123456789');
      expect(str).toContain('Zinger Burger');
      expect(str).toContain('TOTAL');
      expect(str).toContain('Thank you! Visit again.');
    });
  });

  describe('reprint endpoint', () => {
    it('POST /orders/:id/print reprints a receipt', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: zingerItemId, qty: 1 })
        .expect(201);

      // Pay the order first (just to set status)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send`)
        .set('Authorization', `Bearer ${jwtToken}`);

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`);

      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Reprint receipt
      const reprintRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'receipt' })
        .expect(201);

      expect(reprintRes.body.success).toBe(true);

      await new Promise((r) => setTimeout(r, 100));

      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);
      const str = receiptPrints[0].data.toString('ascii');
      expect(str).toContain('Zinger Burger');
    });

    it('POST /orders/:id/print reprints kitchen tickets', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: zingerItemId, qty: 2 })
        .expect(201);

      transport.sent = [];

      const reprintRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'kitchen' })
        .expect(201);

      expect(reprintRes.body.success).toBe(true);

      await new Promise((r) => setTimeout(r, 100));

      const kitchenPrints = transport.sent.filter(
        (s) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
      );
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('audit log entries for printing', () => {
    it('writes printed audit entries on successful print', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: zingerItemId, qty: 1 })
        .expect(201);

      // Send → kitchen print
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send`)
        .set('Authorization', `Bearer ${jwtToken}`);

      // Pay → receipt print
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`);

      await new Promise((r) => setTimeout(r, 300));

      // Check audit log
      const orderRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const auditLog = orderRes2.body.auditLog;
      const printedEntries = auditLog.filter((e: any) => e.action === 'printed');
      expect(printedEntries.length).toBeGreaterThanOrEqual(1);

      // Verify chain is still valid
      const verifyRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/audit/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(verifyRes.body.valid).toBe(true);
    });
  });

  describe('printer status and test endpoints', () => {
    it('GET /printers/:id/status returns reachability', async () => {
      transport.reachable.set('192.168.1.50:9100', false);

      const res = await request(app.getHttpServer())
        .get(`/printers/${receiptPrinterId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(res.body.reachable).toBe(false);

      transport.reachable.set('192.168.1.50:9100', true);
      const res2 = await request(app.getHttpServer())
        .get(`/printers/${receiptPrinterId}/status`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(res2.body.reachable).toBe(true);
    });

    it('POST /printers/:id/test prints test ticket', async () => {
      transport.sent = [];
      const res = await request(app.getHttpServer())
        .post(`/printers/${receiptPrinterId}/test`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);

      await new Promise((r) => setTimeout(r, 100));
      expect(transport.sent.length).toBeGreaterThanOrEqual(1);
      const str = transport.sent[0].data.toString('ascii');
      expect(str).toContain('TEST TICKET');
      expect(str).toContain('Counter');
    });
  });
});
