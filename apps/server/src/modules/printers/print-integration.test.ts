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

  // Replace seeded data with test-specific data
  sqlite.exec(`
    DELETE FROM items;
    DELETE FROM item_categories;
    DELETE FROM tables;
  `);

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
    INSERT INTO items (id, category_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (1, ${burgerCategoryId}, 'Zinger Burger', '${'\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631'}', 2300, 1500, 0, 1, ${now}, ${now});
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
    .send({ username: 'admin', pin: '771133' });
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
  // Clean up open dine-in orders between tests to avoid the
  // "one open order per table" guard from blocking subsequent tests.
  afterEach(async () => {
    const listRes = await request(app.getHttpServer())
      .get('/orders?status=open')
      .set('Authorization', `Bearer ${jwtToken}`);
    const openOrders = listRes.body || [];
    for (const order of openOrders) {
      if (order.tableId != null) {
        try {
          await request(app.getHttpServer())
            .post(`/orders/${order.id}/void`)
            .set('Authorization', `Bearer ${jwtToken}`);
        } catch {
          // ignore — order may already be closed
        }
      }
    }
  });
  describe('automatic kitchen printing on item add', () => {
    it('routes items to the correct kitchen printers by category on sync', async () => {
      // Create order
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'dine_in', tableId: 1 })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to get updatedAt
      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const baseUpdatedAt = getRes.body.updatedAt;

      // Clear transport log before sync
      transport.sent = [];

      // Sync both items in one bulk call
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt,
          items: [
            { itemId: zingerItemId, qty: 2 },
            { itemId: pepsiItemId, qty: 1 },
          ],
        })
        .expect(200);

      // Non-blocking: give kitchen print a moment to process
      await new Promise((r) => setTimeout(r, 300));

      // Should have printed to 2 different kitchen printers
      const kitchenPrinters = transport.sent.filter((s) => s.ip !== '192.168.1.50'); // exclude receipt
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

    it('item sync succeeds even when kitchen printer is unreachable', async () => {
      transport.nextError = new Error('Connection refused');

      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to get updatedAt
      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      transport.sent = [];

      // Sync item should still succeed — kitchen print failure doesn't break order
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));
    });
  });

  describe('automatic kitchen printing on item qty increase', () => {
    it('prints delta when item qty is increased via sync', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'dine_in', tableId: 1 })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to get updatedAt
      const getRes1 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync with qty 2
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes1.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Get updated order to know new updatedAt
      const getRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const itemId = getRes2.body.items[0].id;
      const baseUpdatedAt2 = getRes2.body.updatedAt;

      // Sync qty to 5 (delta = 3: 5 - 2 previously printed)
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: baseUpdatedAt2,
          items: [{ orderItemId: itemId, qty: 5 }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 300));

      // Should have printed the delta (3) to the kitchen
      const kitchenPrints = transport.sent.filter(
        (s) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
      );
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      expect(kitchenPrints[0].data.toString('ascii')).toContain('3 Zinger Burger');
    });
  });

  describe('syncItems kitchen print deltas (edge cases)', () => {
    it('notes-only sync → 0 kitchen print jobs', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync item
      const sync1 = await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      const itemId = sync1.body.items[0].id;
      const updatedAt2 = sync1.body.updatedAt;

      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Notes-only update
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: updatedAt2,
          items: [{ orderItemId: itemId, qty: 1, notes: 'extra spicy' }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));

      // No kitchen prints for notes-only change
      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBe(0);
    });

    it('qty decrease sync → 0 kitchen print jobs', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync with qty 5
      const sync1 = await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 5 }],
        })
        .expect(200);

      const itemId = sync1.body.items[0].id;
      const updatedAt2 = sync1.body.updatedAt;

      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Decrease qty to 2
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: updatedAt2,
          items: [{ orderItemId: itemId, qty: 2 }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));

      // No kitchen prints for qty decrease
      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBe(0);
    });

    it('empty cart sync → 0 kitchen print jobs', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Add items first
      const sync1 = await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 3 }],
        })
        .expect(200);

      const updatedAt2 = sync1.body.updatedAt;

      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Empty cart sync
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: updatedAt2,
          items: [],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));

      // No kitchen prints for empty cart
      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBe(0);
    });
  });

  describe('order pay → receipt printing', () => {
    it('prints receipt with drawer kick on pay (from open)', async () => {
      // Create order
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'dine_in', tableId: 1 })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to get updatedAt
      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync items
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      // Wait for kitchen prints to finish
      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Pay order (open → paid)
      const fetchedOrder = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ payments: [{ methodId: 'cash', amountHalalas: fetchedOrder.body.totalHalalas }] })
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

      // Get order to get updatedAt
      const getRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync items
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes2.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      // Pay the order (open → paid) — 1 Zinger = 2300 halalas
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ payments: [{ methodId: 'cash', amountHalalas: 2300 }] })
        .expect(201);

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

    it('POST /orders/:id/print rejects kitchen target with 400', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to get updatedAt
      const getRes3 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync items
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes3.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      transport.sent = [];

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'kitchen' })
        .expect(400);

      // No kitchen prints should have been sent to the transport
      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBe(0);
    });
  });

  describe('audit log entries for printing', () => {
    it('writes item_added, kitchen_print_enqueued/succeeded, paid, receipt_print_enqueued/succeeded events', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to get updatedAt
      const getRes4 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Sync items via bulk sync
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes4.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      // Wait for async kitchen print
      await new Promise((r) => setTimeout(r, 300));

      // Pay → receipt print (1 Zinger = 2300 halalas)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ payments: [{ methodId: 'cash', amountHalalas: 2300 }] })
        .expect(201);

      // Wait for async receipt print
      await new Promise((r) => setTimeout(r, 300));

      // Check events
      const orderRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const events = orderRes2.body.events;

      // Verify event types
      const types = events.map((e: any) => e.type);

      // created event
      expect(types).toContain('created');

      // item_added + kitchen print events
      expect(types).toContain('item_added');
      expect(types).toContain('kitchen_print_enqueued');
      expect(types).toContain('kitchen_print_succeeded');

      // paid + receipt print events
      expect(types).toContain('paid');
      expect(types).toContain('receipt_print_enqueued');
      expect(types).toContain('receipt_print_succeeded');

      // Verify chain is still valid
      const verifyRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(verifyRes.body.valid).toBe(true);
    });
  });

  describe('Arabic name snapshotting', () => {
    it('addItem snapshots item_name_ar from the menu item onto order_items', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const syncRes = await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      expect(syncRes.body.items.length).toBe(1);
      // زنجر برجر — Arabic name snapshotted from the menu item
      expect(syncRes.body.items[0].itemNameAr).toBe(
        '\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631',
      );

      // The DB row itself carries the snapshot
      const row = (sqlite as any)
        .prepare('SELECT item_name_ar FROM order_items WHERE order_id = ?')
        .get(orderId);
      expect(row.item_name_ar).toBe('\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631');
    });

    it('refund snapshots item_name_ar onto order_refund_items', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const syncRes = await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);
      const orderItemId = syncRes.body.items[0].id;

      // Pay the order (1 Zinger = 2300 halalas) so it can be refunded
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/pay`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ payments: [{ methodId: 'cash', amountHalalas: 2300 }] })
        .expect(201);

      // Refund the item
      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          methodId: 'cash',
          reason: 'Test refund',
          items: [{ orderItemId, qty: 1 }],
        })
        .expect(201);

      const refundId = refundRes.body.refundId;
      const row = (sqlite as any)
        .prepare('SELECT item_name_ar FROM order_refund_items WHERE refund_id = ?')
        .get(refundId);
      expect(row.item_name_ar).toBe('\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631');
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

    it('POST /printers/:id/test prints diagnostic test ticket', async () => {
      transport.sent = [];
      const res = await request(app.getHttpServer())
        .post(`/printers/${receiptPrinterId}/test`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);

      await new Promise((r) => setTimeout(r, 100));
      expect(transport.sent.length).toBeGreaterThanOrEqual(1);
      const str = transport.sent[0].data.toString('ascii');
      expect(str).toContain('PRINT DIAGNOSTIC');
      expect(str).toContain('Counter');
      expect(str).toContain('192.168.1.50:9100');
      expect(str).toContain('END DIAGNOSTIC');
      // New diagnostic should be much larger than old 4-line ticket
      expect(transport.sent[0].data.length).toBeGreaterThan(400);
    });
  });
});
