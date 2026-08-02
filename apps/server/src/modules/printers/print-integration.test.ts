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
  await app.listen(0);
  await app.init();

  // Inject fake transport
  transport = new FakePrinterTransport();
  const ps = app.get(PrintersService);
  ps.setTransport(transport);

  const now = Math.floor(Date.now() / 1000);

  // Replace seeded data with test-specific data
  sqlite.exec(`
    DELETE FROM items;
    DELETE FROM item_subcategories;
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

  // Seed: subcategories for both categories
  sqlite.exec(`
    INSERT INTO item_subcategories (id, category_id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 1, 'Chicken', 0, 1, ${now}, ${now});
  `);
  sqlite.exec(`
    INSERT INTO item_subcategories (id, category_id, name, sort_order, is_active, created_at, updated_at)
    VALUES (2, 2, 'Soft Drinks', 0, 1, ${now}, ${now});
  `);

  // Seed: items
  sqlite.exec(`
    INSERT INTO items (id, category_id, subcategory_id, name, name_ar, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (1, ${burgerCategoryId}, 1, 'Zinger Burger', '${'\u0632\u0646\u062C\u0631 \u0628\u0631\u062C\u0631'}', 2300, 1500, 0, 1, ${now}, ${now});
  `);
  zingerItemId = 1;

  sqlite.exec(`
    INSERT INTO items (id, category_id, subcategory_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (2, ${drinksCategoryId}, 2, 'Pepsi', 575, 1500, 0, 1, ${now}, ${now});
  `);
  pepsiItemId = 2;

  // Seed: table
  sqlite.exec(`
    INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'T4', 0, 1, ${now}, ${now});
  `);

  // Seed: delivery partner + its owned payment method (ADR 0007, 1:1 slug)
  sqlite.exec(`
    INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
    VALUES ('hungerstation', 'HungerStation', 1, 0, ${now}, ${now});
    INSERT INTO payment_methods (id, title, zatca_payment_means_code, enabled, sort_order, created_at, updated_at)
    VALUES ('hungerstation', 'HungerStation', '30', 1, 0, ${now}, ${now});
  `);

  // Seed: settings
  sqlite.exec(`
    INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
    INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789');
  `);

  // Login
  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username: 'admin', pin: '771133', clientType: 'pos' })
    .expect(201);
  jwtToken = loginRes.body.accessToken;
  expect(jwtToken).toBeTruthy();

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
    const openOrders = Array.isArray(listRes.body) ? listRes.body : [];
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
  describe('explicit send-to-kitchen fan-out (TEMPORARY: all active kitchen printers)', () => {
    it('sends the same full ticket to every active kitchen printer on send-to-kitchen', async () => {
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

      // Sync both items in one bulk call — sync NEVER kitchen-prints (ADR 0006)
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

      // Clear transport log before the explicit send
      transport.sent = [];

      // Explicit differential kitchen print
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Non-blocking: give kitchen print a moment to process
      await new Promise((r) => setTimeout(r, 300));

      // TEMPORARY fan-out: BOTH kitchen printers (Kitchen .51 + Cold Station
      // .52) receive the full ticket — each buffer built for its own station
      // (printer name in the header); the receipt printer (.50) never
      // receives kitchen tickets
      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50'); // exclude receipt
      expect(kitchenPrints).toHaveLength(2);

      for (const print of kitchenPrints) {
        const str = print.data.toString('ascii');
        // Item blocks: dash-prefixed name line + indented Qty line
        expect(str).toContain('- Zinger Burger');
        expect(str).toContain('    Qty: 2x');
        expect(str).toContain('- Pepsi');
        expect(str).toContain('    Qty: 1x');
        // No old "qty name" single-line item format
        expect(str).not.toContain('2 Zinger Burger');
        // Big header id is the ZATCA documentId, NOT the order number
        expect(str).toContain(orderRes.body.documentId);
        expect(str).not.toContain(`ORDER #${orderRes.body.orderNo}`);
        // Dine-in on table T4 → table on its own big line
        expect(str).toContain('TABLE T4');
      }

      // Each fan-out target receives its OWN buffer, naming its station in
      // the header (Kitchen .51 and Cold Station .52).
      const byIp = new Map(kitchenPrints.map((p) => [p.ip, p.data.toString('ascii')]));
      expect(byIp.get('192.168.1.51')).toContain('Printer: Kitchen');
      expect(byIp.get('192.168.1.52')).toContain('Printer: Cold Station');

      // Exactly ONE kitchen_print_enqueued per send: items cover both lines,
      // printers[] lists both fan-out targets
      const orderRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const enqueued = orderRes2.body.events.filter(
        (e: any) => e.type === 'kitchen_print_enqueued',
      );
      expect(enqueued).toHaveLength(1);
      const payload = JSON.parse(enqueued[0].payload);
      expect(payload.items).toHaveLength(2);
      expect(payload.items.map((i: any) => i.itemName).sort()).toEqual(['Pepsi', 'Zinger Burger']);
      expect(payload.printers).toHaveLength(2);
      expect(payload.printers.map((pr: any) => pr.printer).sort()).toEqual([
        'Cold Station',
        'Kitchen',
      ]);
      expect(payload.printer).toContain('Kitchen');
      expect(payload.printer).toContain('Cold Station');
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

      // Sync item should still succeed — kitchen printing is decoupled from sync
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));

      // No kitchen prints at all from sync
      expect(transport.sent.filter((s) => s.ip !== '192.168.1.50').length).toBe(0);

      // Sync never sends, so the injected error was NOT consumed — reset it so
      // it doesn't leak into the next test's prints
      transport.nextError = null;
    });

    it('send-to-kitchen succeeds (200) even when the kitchen printer is unreachable', async () => {
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

      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      // One kitchen printer will fail — the request itself must still return 200
      transport.nextError = new Error('Connection refused');
      transport.sent = [];

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Enqueued is written; kitchen_print_succeeded only for printers that
      // actually printed (the first fan-out target consumes nextError and fails,
      // the other kitchen printer succeeds)
      await new Promise((r) => setTimeout(r, 200));
      const orderRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const types = orderRes2.body.events.map((e: any) => e.type);
      expect(types).toContain('kitchen_print_enqueued');
      const succeeded = orderRes2.body.events
        .filter((e: any) => e.type === 'kitchen_print_succeeded')
        .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload));
      expect(succeeded.length).toBeGreaterThanOrEqual(1);
      // The printer that consumed the error must NOT report success
      expect(succeeded.every((p: any) => p.printer !== 'Kitchen')).toBe(true);
    });
  });

  describe('explicit send-to-kitchen deltas (ADR 0006)', () => {
    it('prints delta when item qty is increased via sync then sent', async () => {
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

      // Sync with qty 2 (no kitchen print)
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

      // Send 2 to the kitchen
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));

      // Get updated order to know new updatedAt
      const getRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const itemId = getRes2.body.items[0].id;
      const baseUpdatedAt2 = getRes2.body.updatedAt;

      // Sync qty to 5 (delta = 3: 5 − 2 already printed) — sync itself prints nothing
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: baseUpdatedAt2,
          items: [{ orderItemId: itemId, qty: 5 }],
        })
        .expect(200);

      transport.sent = [];

      // Explicit send prints ONLY the delta (3)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      await new Promise((r) => setTimeout(r, 300));

      // Should have printed the delta (3) to the kitchen
      const kitchenPrints = transport.sent.filter(
        (s) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
      );
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      const deltaStr = kitchenPrints[0].data.toString('ascii');
      // Single delta item → dash-prefixed name block with the delta qty
      expect(deltaStr).toContain('- Zinger Burger');
      expect(deltaStr).toContain('    Qty: 3x');
    });
  });

  describe('syncItems never kitchen-prints (edge cases)', () => {
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

  describe('order submit → receipt printing', () => {
    it('prints receipt with drawer kick on submit (from open)', async () => {
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

      // Give any async prints a moment to settle before clearing the log
      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Finalize order (open → paid) via payments + submit
      const fetchedOrder = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: fetchedOrder.body.totalHalalas })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
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

    it('printReceipt:false skips the receipt transport call but still kicks the drawer for cash', async () => {
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

      // Give any async prints a moment to settle before clearing the log
      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Finalize order (open → paid) with printReceipt:false — cash payment
      const fetchedOrder = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: fetchedOrder.body.totalHalalas })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ printReceipt: false })
        .expect(201);

      await new Promise((r) => setTimeout(r, 200));

      // No full receipt was printed — the ONLY transport call is the drawer
      // kick, a minimal ESC/POS buffer with no receipt content
      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints).toHaveLength(1);
      const str = receiptPrints[0].data.toString('ascii');
      expect(str).not.toContain('SpicyHome');
      expect(str).not.toContain('TOTAL');
      // But the drawer kick command (ESC p) IS present
      expect(receiptPrints[0].data.toString('hex')).toContain('1b70');

      // Ledger: no receipt_print_enqueued, but the drawer kick was enqueued
      const orderRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const types = orderRes2.body.events.map((e: any) => e.type);
      expect(types).toContain('paid');
      expect(types).not.toContain('receipt_print_enqueued');
      expect(types).toContain('cash_drawer_kick_enqueued');
    });
  });

  describe('delivery partner on prints (ADR 0007)', () => {
    it('prints partner title + external ref on kitchen ticket and receipt', async () => {
      // Create takeaway order
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      // Sync items (sync response carries the fresh updatedAt)
      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const syncRes = await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      // Set the delivery partner + external ref
      const patched = await request(app.getHttpServer())
        .patch(`/orders/${orderId}/partner`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: syncRes.body.updatedAt,
          deliveryPartnerId: 'hungerstation',
          deliveryExternalRef: 'HS-883129',
        })
        .expect(200);
      expect(patched.body.deliveryPartnerId).toBe('hungerstation');
      expect(patched.body.deliveryPartnerTitle).toBe('HungerStation');
      expect(patched.body.deliveryExternalRef).toBe('HS-883129');

      // Kitchen: send-to-kitchen prints partner + ref
      transport.sent = [];
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));

      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      const kitchenStr = kitchenPrints[0].data.toString('ascii');
      expect(kitchenStr).toContain('Delivery: HungerStation');
      expect(kitchenStr).toContain('App order #: HS-883129');

      // Receipt: pay through the partner's own method + submit (2 × 2300)
      transport.sent = [];
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'hungerstation', amountHalalas: 4600 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
        .expect(201);
      await new Promise((r) => setTimeout(r, 300));

      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);
      const receiptStr = receiptPrints[0].data.toString('ascii');
      expect(receiptStr).toContain('Type: Takeaway');
      expect(receiptStr).toContain('Delivery: HungerStation');
      expect(receiptStr).toContain('App order #: HS-883129');
    });

    it('kitchen ticket omits partner lines for a walk-in takeaway', async () => {
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
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      transport.sent = [];
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));

      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      const kitchenStr = kitchenPrints[0].data.toString('ascii');
      expect(kitchenStr).not.toContain('Delivery:');
      expect(kitchenStr).not.toContain('App order #:');
    });
  });

  describe('order notes on prints', () => {
    it('kitchen ticket prints order notes when set at create time', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway', notes: 'call on arrival' })
        .expect(201);
      const orderId = orderRes.body.id;

      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(getRes.body.notes).toBe('call on arrival');

      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      transport.sent = [];
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));

      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      const kitchenStr = kitchenPrints[0].data.toString('ascii');
      expect(kitchenStr).toContain('NOTES: call on arrival');
      // Item notes still flow on the same ticket — item as its own block
      expect(kitchenStr).toContain('- Zinger Burger');
      expect(kitchenStr).toContain('    Qty: 2x');
    });

    it('notes-only meta PATCH does not enqueue kitchen prints; notes appear on next send-to-kitchen', async () => {
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
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      // Clear the transport log, then PATCH notes only (same type/table)
      transport.sent = [];
      const refreshed = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const patched = await request(app.getHttpServer())
        .patch(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: refreshed.body.updatedAt,
          type: 'takeaway',
          notes: 'extra napkins',
        })
        .expect(200);
      expect(patched.body.notes).toBe('extra napkins');

      // Notes-only change must NOT print anything
      await new Promise((r) => setTimeout(r, 200));
      expect(transport.sent).toHaveLength(0);

      // The notes ride along on the next explicit send-to-kitchen
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));

      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      expect(kitchenPrints[0].data.toString('ascii')).toContain('NOTES: extra napkins');
    });

    it('kitchen ticket omits NOTES line when order has no notes', async () => {
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
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      transport.sent = [];
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      await new Promise((r) => setTimeout(r, 300));

      const kitchenPrints = transport.sent.filter((s) => s.ip !== '192.168.1.50');
      expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
      expect(kitchenPrints[0].data.toString('ascii')).not.toContain('NOTES:');
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

      // Finalize the order (open → paid) via payments + submit — 1 Zinger = 2300 halalas
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 2300 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
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

    it('POST /orders/:id/print with target open_receipt prints a non-ZATCA open order slip', async () => {
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

      // Sync items (order stays open)
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      transport.sent = [];

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'open_receipt' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.errors).toEqual([]);

      await new Promise((r) => setTimeout(r, 100));

      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);
      const str = receiptPrints[0].data.toString('ascii');
      expect(str).toContain('OPEN ORDER RECEIPT');
      expect(str).not.toContain('SIMPLIFIED TAX INVOICE');
      expect(str).toContain('Order #:');
      expect(str).not.toContain('Invoice #');
      expect(str).not.toContain('VAT: 300123456789'); // no VAT registration
      expect(str).toContain('Zinger Burger');
      expect(str).toContain('TOTAL (incl. VAT)');
      expect(str).toContain('NOT A TAX INVOICE');

      // No drawer kick on the open order slip
      expect(receiptPrints[0].data.toString('hex')).not.toContain('1b70');

      // Events carry kind 'open_order' so the timeline can distinguish it
      const orderRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const enqueued = orderRes2.body.events.find((e: any) => e.type === 'receipt_print_enqueued');
      expect(enqueued).toBeDefined();
      expect(JSON.parse(enqueued.payload).kind).toBe('open_order');
      expect(JSON.parse(enqueued.payload).kickDrawer).toBe(false);
    });

    it('open order receipt shows PAID and AMOUNT DUE reduced by a partial payment', async () => {
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

      // 2 Zinger = 4600 halalas (46.00)
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 2 }],
        })
        .expect(200);

      // Partial payment before food (ADR 0006): 1000 halalas of 4600
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 1000 })
        .expect(201);

      transport.sent = [];

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'open_receipt' })
        .expect(201);
      expect(res.body.success).toBe(true);

      await new Promise((r) => setTimeout(r, 100));

      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);
      const str = receiptPrints[0].data.toString('ascii');
      const paidLine = str.split('\n').find((l) => l.trimStart().startsWith('PAID'));
      expect(paidLine).toBeDefined();
      expect(paidLine).toContain('10.00');
      // Strip ESC/POS command bytes so the bold-prefixed label starts the line
      const dueLine = str
        .replace(/\x1bE[\x00\x01]/g, '')
        .split('\n')
        .find((l) => l.startsWith('AMOUNT DUE'));
      expect(dueLine).toBeDefined();
      expect(dueLine).toContain('36.00'); // 46.00 − 10.00
    });

    it('POST /orders/:id/print with target open_receipt rejects paid orders with 400', async () => {
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

      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      // Finalize (open → paid): 1 Zinger = 2300 halalas
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 2300 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
        .expect(201);

      transport.sent = [];

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'open_receipt' })
        .expect(400);

      expect(res.body.message).toContain('Open order receipt is only available for open orders');
      // Nothing should have been sent to the printer
      expect(transport.sent.length).toBe(0);
    });

    it('POST /orders/:id/print with target open_receipt rejects empty carts with 400', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'open_receipt' })
        .expect(400);

      expect(res.body.message).toContain('empty order');
    });

    it('POST /orders/:id/print still rejects unknown targets with 400', async () => {
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ target: 'open_invoice' })
        .expect(400);
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

      // Sync items via bulk sync — no kitchen print here (ADR 0006)
      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes4.body.updatedAt,
          items: [{ itemId: zingerItemId, qty: 1 }],
        })
        .expect(200);

      // Explicit send-to-kitchen — the only kitchen-print path
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/send-to-kitchen`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Wait for async kitchen print
      await new Promise((r) => setTimeout(r, 300));

      // Finalize via payments + submit → receipt print (1 Zinger = 2300 halalas)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 2300 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
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

      // Finalize via payments + submit (1 Zinger = 2300 halalas) so it can be refunded
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 2300 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({})
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
