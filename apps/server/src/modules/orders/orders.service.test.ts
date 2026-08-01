import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@spicyhome/db';
import { AppModule } from '../../app.module';
import { DRIZZLE } from '../database/database.module';
import { FakePrinterTransport } from '../printers/printer-transport';
import { PrintersService } from '../printers/printers.service';
import { OrdersService } from './orders.service';

let app: INestApplication;
let sqlite: any;
let db: any;
let jwtToken: string;
let transport: FakePrinterTransport;

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

  // Listen explicitly ONCE so supertest reuses a stable port instead of
  // re-listening (listen(0)) on every request, which races and can send
  // requests to stale listeners in full-suite runs.
  await app.listen(0);

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

  // Seed: kitchen printer
  sqlite.exec(`
    INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
    VALUES (2, 'Kitchen', '192.168.1.51', 9100, 'kitchen', 1, ${now}, ${now});
  `);

  // Seed: category with printer routing
  sqlite.exec(`
    INSERT INTO item_categories (id, name, sort_order, printer_id, is_active, created_at, updated_at)
    VALUES (1, 'Burgers', 0, 2, 1, ${now}, ${now});
  `);

  // Seed: items
  sqlite.exec(`
    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (1, 1, 'Zinger Burger', 2300, 1500, 0, 1, ${now}, ${now});
    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (2, 1, 'Pepsi', 575, 1500, 0, 1, ${now}, ${now});
    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (3, 1, 'Fries', 1150, 1500, 0, 1, ${now}, ${now});
  `);

  // Seed: table
  sqlite.exec(`
    INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'T1', 0, 1, ${now}, ${now});
  `);

  // Seed: settings
  sqlite.exec(`
    INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
    INSERT INTO settings (key, value) VALUES ('vat_number', '300123456789');
  `);

  // Login
  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username: 'admin', pin: '771133', clientType: 'pos' });
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

describe('Order Refunds', () => {
  async function createPaidOrder(): Promise<{
    orderId: number;
    items: Array<{ id: number; itemName: string }>;
  }> {
    // Create order
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;

    // Get order to know its updatedAt
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Add items via bulk sync
    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: getRes.body.updatedAt,
        items: [
          { itemId: 1, qty: 2 },
          { itemId: 2, qty: 1 },
        ],
      })
      .expect(200);

    // Wait for kitchen prints
    await new Promise((r) => setTimeout(r, 200));

    // Get order to capture item IDs
    const fetched = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Finalize: append cash payment, then submit (ADR 0006)
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: fetched.body.totalHalalas })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    // Wait for receipt print
    await new Promise((r) => setTimeout(r, 200));

    return {
      orderId,
      items: fetched.body.items.map((i: any) => ({ id: i.id, itemName: i.itemName })),
    };
  }

  describe('refundOrder', () => {
    it('partial refund succeeds and leaves order paid', async () => {
      const { orderId, items } = await createPaidOrder();
      transport.sent = [];

      // Find the Zinger Burger item
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      // Refund 1 of 2 Zinger Burgers
      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          items: [{ orderItemId: zingerItem.id, qty: 1 }],
          reason: 'Customer changed mind',
          methodId: 'cash',
        })
        .expect(201);

      expect(refundRes.body.success).toBe(true);
      expect(refundRes.body.refundId).toBeGreaterThan(0);
      expect(refundRes.body.status).toBe('paid');

      // Verify order is still paid
      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(orderRes.body.status).toBe('paid');

      // Verify refund receipt was printed
      await new Promise((r) => setTimeout(r, 200));
      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);
      const receiptStr = receiptPrints[receiptPrints.length - 1].data.toString('ascii');
      expect(receiptStr).toContain('CREDIT NOTE');

      // Verify events were written
      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const types = eventsRes.body.map((e: any) => e.type);
      expect(types).toContain('refund_issued');
      expect(types).toContain('receipt_print_enqueued');
      // refunded should NOT be present since it's partial
      expect(types).not.toContain('refunded');

      // Verify chain integrity
      const verifyRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(verifyRes.body.valid).toBe(true);
    });

    it('full refund transitions order to refunded', async () => {
      const { orderId, items } = await createPaidOrder();

      // Fully refund all items
      const refundItems = items.map((i: any) => ({
        orderItemId: i.id,
        qty: i.itemName === 'Zinger Burger' ? 2 : 1,
      }));

      transport.sent = [];

      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: refundItems, methodId: 'cash' })
        .expect(201);

      expect(refundRes.body.success).toBe(true);
      expect(refundRes.body.status).toBe('refunded');

      // Verify order is now refunded
      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(orderRes.body.status).toBe('refunded');

      // Verify events
      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      const types = eventsRes.body.map((e: any) => e.type);
      expect(types).toContain('refund_issued');
      expect(types).toContain('refunded');

      // Verify chain integrity
      const verifyRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(verifyRes.body.valid).toBe(true);
    });

    it('refunding more qty than remaining throws', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      // Refund 1 first (partial)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'cash' })
        .expect(201);

      // Try to refund 2 more — should fail (only 1 remaining)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 2 }], methodId: 'cash' })
        .expect(400);
    });

    it('refunding from non-paid order throws', async () => {
      // Create an order but don't pay it
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to know updatedAt
      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes.body.updatedAt,
          items: [{ itemId: 1, qty: 1 }],
        })
        .expect(200);

      // Get the item ID
      const fetched = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Try to refund an open order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: fetched.body.items[0].id, qty: 1 }], methodId: 'cash' })
        .expect(400);
    });

    it('refunding from voided order throws', async () => {
      // Create an order and void it
      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ type: 'takeaway' })
        .expect(201);
      const orderId = orderRes.body.id;

      // Get order to know updatedAt
      const getRes2 = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .put(`/orders/${orderId}/items/sync`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          baseUpdatedAt: getRes2.body.updatedAt,
          items: [{ itemId: 1, qty: 1 }],
        })
        .expect(200);

      const fetched = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      // Try to refund a voided order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: fetched.body.items[0].id, qty: 1 }], methodId: 'cash' })
        .expect(400);
    });

    it('rejects unknown methodId on refund', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'bitcoin' })
        .expect(400);
    });

    it('rejects disabled method on refund', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      // Disable mada
      db.update(schema.paymentMethods)
        .set({ enabled: 0 })
        .where(eq(schema.paymentMethods.id, 'mada'))
        .run();

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'mada' })
        .expect(400);

      // Re-enable for other tests
      db.update(schema.paymentMethods)
        .set({ enabled: 1 })
        .where(eq(schema.paymentMethods.id, 'mada'))
        .run();
    });

    it('rejects missing methodId on refund', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }] })
        .expect(400);
    });
  });

  describe('getOrderRefunds', () => {
    it('returns created refunds with items', async () => {
      const { orderId, items } = await createPaidOrder();

      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      // Issue a partial refund
      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          items: [{ orderItemId: zingerItem.id, qty: 1 }],
          reason: 'Test refund',
          methodId: 'cash',
        })
        .expect(201);

      // Get refunds
      const getRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/refunds`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(getRes.body)).toBe(true);
      expect(getRes.body.length).toBe(1);

      const refund = getRes.body[0];
      expect(refund.id).toBe(refundRes.body.refundId);
      expect(refund.orderId).toBe(orderId);
      expect(refund.methodId).toBe('cash');
      expect(refund.methodTitle).toBe('Cash');
      expect(refund.zatcaPaymentMeansCode).toBe('10');
      expect(refund.reason).toBe('Test refund');
      expect(refund.totalHalalas).toBeGreaterThan(0);
      expect(refund.subtotalHalalas).toBeGreaterThan(0);
      expect(refund.vatHalalas).toBeGreaterThan(0);

      // Check items
      expect(Array.isArray(refund.items)).toBe(true);
      expect(refund.items.length).toBe(1);
      expect(refund.items[0].orderItemId).toBe(zingerItem.id);
      expect(refund.items[0].itemName).toBe('Zinger Burger');
      expect(refund.items[0].qty).toBe(1);
      expect(refund.items[0].totalHalalas).toBe(2300); // 1 × 2300
    });
  });

  describe('receipt print events', () => {
    it('refund receipt print events are written (enqueued + succeeded)', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'cash' })
        .expect(201);

      // Wait for async print
      await new Promise((r) => setTimeout(r, 200));

      // Verify events
      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const types = eventsRes.body.map((e: any) => e.type);
      expect(types).toContain('receipt_print_enqueued');
      expect(types).toContain('receipt_print_succeeded');

      // The refund-related receipt_print_enqueued is the last one (after pay); kickDrawer: true for cash refund
      const enqueuedEvents = eventsRes.body.filter((e: any) => e.type === 'receipt_print_enqueued');
      expect(enqueuedEvents.length).toBeGreaterThanOrEqual(2); // pay enqueued + refund enqueued
      const refundEnqueuedEvent = enqueuedEvents[enqueuedEvents.length - 1];
      expect(refundEnqueuedEvent).toBeDefined();
      const refundEnqueuedPayload =
        typeof refundEnqueuedEvent.payload === 'string'
          ? JSON.parse(refundEnqueuedEvent.payload)
          : refundEnqueuedEvent.payload;
      expect(refundEnqueuedPayload.kickDrawer).toBe(true);
    });

    it('card refund receipt print has kickDrawer: false', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'card' })
        .expect(201);

      // Refund row snapshots the card method's ZATCA code
      const refundRow = db
        .select()
        .from(schema.orderRefunds)
        .where(eq(schema.orderRefunds.orderId, orderId))
        .get() as any;
      expect(refundRow.methodId).toBe('card');
      expect(refundRow.zatcaPaymentMeansCode).toBe('48');

      // Wait for async print
      await new Promise((r) => setTimeout(r, 200));

      // Verify events
      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // The refund-related receipt_print_enqueued is the last one; kickDrawer: false for card refund
      const enqueuedEvents = eventsRes.body.filter((e: any) => e.type === 'receipt_print_enqueued');
      expect(enqueuedEvents.length).toBeGreaterThanOrEqual(2);
      const refundEnqueuedEvent = enqueuedEvents[enqueuedEvents.length - 1];
      expect(refundEnqueuedEvent).toBeDefined();
      const refundEnqueuedPayload =
        typeof refundEnqueuedEvent.payload === 'string'
          ? JSON.parse(refundEnqueuedEvent.payload)
          : refundEnqueuedEvent.payload;
      expect(refundEnqueuedPayload.kickDrawer).toBe(false);
    });
  });

  describe('reprint refund receipt', () => {
    it('POST /orders/:id/refunds/:refundId/print reprints the specific refund receipt', async () => {
      const { orderId, items } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      // Issue a partial refund
      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'cash' })
        .expect(201);
      const refundId = refundRes.body.refundId;
      expect(refundId).toBeGreaterThan(0);

      // Wait for the async auto-print, then clear the transport
      await new Promise((r) => setTimeout(r, 200));
      transport.sent = [];

      // Reprint the refund receipt
      const reprintRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refunds/${refundId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      expect(reprintRes.body.success).toBe(true);

      // The reprint is awaited in the handler, but keep a small settle window
      await new Promise((r) => setTimeout(r, 100));

      const receiptPrints = transport.sent.filter((s) => s.ip === '192.168.1.50');
      expect(receiptPrints.length).toBeGreaterThanOrEqual(1);
      const str = receiptPrints[receiptPrints.length - 1].data.toString('ascii');
      expect(str).toContain('CREDIT NOTE');

      // Events: the reprint's enqueued + succeeded events carry refundId
      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const enqueuedEvents = eventsRes.body.filter((e: any) => e.type === 'receipt_print_enqueued');
      const lastEnqueued = enqueuedEvents[enqueuedEvents.length - 1];
      expect(lastEnqueued).toBeDefined();
      const enqueuedPayload =
        typeof lastEnqueued.payload === 'string'
          ? JSON.parse(lastEnqueued.payload)
          : lastEnqueued.payload;
      expect(enqueuedPayload.refundId).toBe(refundId);

      const succeededEvents = eventsRes.body.filter(
        (e: any) => e.type === 'receipt_print_succeeded',
      );
      const lastSucceeded = succeededEvents[succeededEvents.length - 1];
      expect(lastSucceeded).toBeDefined();
      const succeededPayload =
        typeof lastSucceeded.payload === 'string'
          ? JSON.parse(lastSucceeded.payload)
          : lastSucceeded.payload;
      expect(succeededPayload.refundId).toBe(refundId);

      // Chain integrity preserved
      const verifyRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);
      expect(verifyRes.body.valid).toBe(true);
    });

    it('returns 404 for unknown refundId', async () => {
      const { orderId } = await createPaidOrder();

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refunds/999999/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });

    it('returns 404 for unknown order', async () => {
      await request(app.getHttpServer())
        .post('/orders/999999/refunds/1/print')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });

    it('returns 400 when the refund belongs to a different order', async () => {
      const { orderId: orderIdA, items } = await createPaidOrder();
      const { orderId: orderIdB } = await createPaidOrder();
      const zingerItem = items.find((i: any) => i.itemName === 'Zinger Burger')!;

      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderIdA}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'cash' })
        .expect(201);

      // Try to reprint refund A's receipt through order B
      await request(app.getHttpServer())
        .post(`/orders/${orderIdB}/refunds/${refundRes.body.refundId}/print`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(400);
    });
  });

  describe('events endpoints', () => {
    it('GET /orders/:id/events returns the event chain', async () => {
      const { orderId } = await createPaidOrder();

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      // Events should be ordered by eventIdx
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i].eventIdx).toBeGreaterThan(res.body[i - 1].eventIdx);
      }

      // Should contain event types
      const types = res.body.map((e: any) => e.type);
      expect(types).toContain('created');
      expect(types).toContain('paid');
    });

    it('GET /orders/:id/events/verify returns valid for intact chain', async () => {
      const { orderId } = await createPaidOrder();

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.valid).toBe(true);
    });
  });
});

describe('Submit order — POST /orders/:id/submit (ADR 0006)', () => {
  // Append one or more payment lines, then submit (the only open → paid path).
  async function payViaPaymentsAndSubmit(
    orderId: number,
    payments: Array<{ methodId: string; amountHalalas: number; tenderedHalalas?: number }>,
    submitDto: Record<string, unknown> = {},
  ) {
    for (const p of payments) {
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(p)
        .expect(201);
    }
    return request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(submitDto)
      .expect(201);
  }

  async function createOpenOrderWithItems(): Promise<{
    orderId: number;
    totalHalalas: number;
    items: Array<{ id: number; itemName: string }>;
  }> {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;

    // Fetch to get updatedAt for syncItems
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Add Zinger Burger (2300 halalas) via bulk sync
    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: getRes.body.updatedAt,
        items: [{ itemId: 1, qty: 2 }],
      })
      .expect(200);

    await new Promise((r) => setTimeout(r, 100));

    const fetched = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    return {
      orderId,
      totalHalalas: fetched.body.totalHalalas,
      items: fetched.body.items,
    };
  }

  async function voidOrder(orderId: number) {
    try {
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${jwtToken}`);
    } catch {
      // Ignore
    }
  }

  it('rejects submit without any payments (outstanding ≠ 0, 400)', async () => {
    const { orderId } = await createOpenOrderWithItems();
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('does not equal order total');
    await voidOrder(orderId);
  });

  it('rejects submit with outstanding ≠ 0 (underpay and overpay, 400)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    // Underpay: 100 halalas short
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas - 100 })
      .expect(201);
    const underRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
    expect(underRes.body.message).toContain('does not equal order total');
    expect(underRes.body.message).toContain('Outstanding 100 halalas');

    // Balance it, then overpay: still rejected — outstanding must be EXACTLY 0
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 200 })
      .expect(201);
    const overRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
    expect(overRes.body.message).toContain('Outstanding -100 halalas');

    // Fix the overpay with a negative correction, then submit succeeds
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: -100 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);
  });

  it('rejects submit with a negative method net (400)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    // total 4600: cash 4650 + card −50 → overall sum = total, but the card
    // method nets negative → submit must reject (ADR 0006 precondition 6)
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas + 50 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'card', amountHalalas: -50 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('"card" nets negative (-50 halalas)');

    // Order stays open
    const stillOpen = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(stillOpen.body.status).toBe('open');

    await voidOrder(orderId);
  });

  it('rejects submit with 0 items (400)', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('without items');
  });

  it('rejects submit on a non-open (paid) order (400)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    await payViaPaymentsAndSubmit(orderId, [{ methodId: 'cash', amountHalalas: totalHalalas }]);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(400);
    expect(res.body.message).toContain("Cannot submit order in 'paid' status");
  });

  it('stale baseUpdatedAt → 409 with updatedAt', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    // Capture updatedAt BEFORE the payment append (append bumps updated_at)
    const before = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Ensure updated_at ticks past the captured value before the append
    await new Promise((r) => setTimeout(r, 1500));

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Stale baseUpdatedAt → 409 with the standard conflict shape
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: before.body.updatedAt })
      .expect(409);
    expect(res.body.message).toBe(
      'Order was modified by another terminal. Please refresh your cart.',
    );
    expect(res.body.updatedAt).toBe(after.body.updatedAt);

    // Order stays open; with the fresh updatedAt the submit succeeds
    const stillOpen = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(stillOpen.body.status).toBe('open');

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: after.body.updatedAt })
      .expect(201);
  }, 10000);

  it('pays cash-only exact and creates order_payments row', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    transport.sent = [];
    const payRes = await payViaPaymentsAndSubmit(orderId, [
      { methodId: 'cash', amountHalalas: totalHalalas },
    ]);

    expect(payRes.body.status).toBe('paid');
    expect(payRes.body.invoiceType).toBe('simplified');

    // Verify order_payments row exists (created by the append, not submit)
    const payments = db
      .select()
      .from(schema.orderPayments)
      .where(eq(schema.orderPayments.orderId, orderId))
      .all();
    expect(payments).toHaveLength(1);
    expect(payments[0].methodId).toBe('cash');
    expect(payments[0].zatcaPaymentMeansCode).toBe('10');
    expect(payments[0].amountHalalas).toBe(totalHalalas);
    expect(payments[0].tenderedHalalas).toBe(totalHalalas);
    expect(payments[0].changeHalalas).toBe(0);

    // Verify kickDrawer is true (receipt_print_enqueued event)
    await new Promise((r) => setTimeout(r, 200));
    const eventsRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const paidEvent = eventsRes.body.find((e: any) => e.type === 'paid');
    expect(paidEvent).toBeDefined();
    const paidPayload =
      typeof paidEvent.payload === 'string' ? JSON.parse(paidEvent.payload) : paidEvent.payload;
    expect(paidPayload.payments).toBeDefined();
    expect(paidPayload.payments[0].methodId).toBe('cash');
    // paid event carries the full raw ledger + netted per-method breakdown
    expect(paidPayload.netPayments).toEqual([{ methodId: 'cash', amountHalalas: totalHalalas }]);

    const enqueuedEvent = eventsRes.body.find((e: any) => e.type === 'receipt_print_enqueued');
    expect(enqueuedEvent).toBeDefined();
    const enqueuedPayload =
      typeof enqueuedEvent.payload === 'string'
        ? JSON.parse(enqueuedEvent.payload)
        : enqueuedEvent.payload;
    expect(enqueuedPayload.kickDrawer).toBe(true);
  });

  it('pays card-only and kickDrawer is false', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    transport.sent = [];
    const payRes = await payViaPaymentsAndSubmit(orderId, [
      { methodId: 'card', amountHalalas: totalHalalas },
    ]);

    expect(payRes.body.status).toBe('paid');

    // Verify order_payments row
    const payments = db
      .select()
      .from(schema.orderPayments)
      .where(eq(schema.orderPayments.orderId, orderId))
      .all();
    expect(payments).toHaveLength(1);
    expect(payments[0].methodId).toBe('card');
    expect(payments[0].zatcaPaymentMeansCode).toBe('48');
    expect(payments[0].tenderedHalalas).toBeNull();
    expect(payments[0].changeHalalas).toBeNull();

    // kickDrawer must be false
    await new Promise((r) => setTimeout(r, 200));
    const eventsRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const enqueuedEvent = eventsRes.body.find((e: any) => e.type === 'receipt_print_enqueued');
    expect(enqueuedEvent).toBeDefined();
    const enqueuedPayload =
      typeof enqueuedEvent.payload === 'string'
        ? JSON.parse(enqueuedEvent.payload)
        : enqueuedEvent.payload;
    expect(enqueuedPayload.kickDrawer).toBe(false);
  });

  it('pays split card+cash via two appended lines and submits', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    const cardAmount = 2300;
    const cashAmount = totalHalalas - cardAmount;

    const payRes = await payViaPaymentsAndSubmit(orderId, [
      { methodId: 'card', amountHalalas: cardAmount },
      { methodId: 'cash', amountHalalas: cashAmount, tenderedHalalas: cashAmount + 500 },
    ]);

    expect(payRes.body.status).toBe('paid');

    const payments = db
      .select()
      .from(schema.orderPayments)
      .where(eq(schema.orderPayments.orderId, orderId))
      .all();
    expect(payments).toHaveLength(2);

    const cardPayment = payments.find((p: any) => p.methodId === 'card')!;
    expect(cardPayment.amountHalalas).toBe(cardAmount);
    expect(cardPayment.zatcaPaymentMeansCode).toBe('48');

    const cashPayment = payments.find((p: any) => p.methodId === 'cash')!;
    expect(cashPayment.amountHalalas).toBe(cashAmount);
    expect(cashPayment.zatcaPaymentMeansCode).toBe('10');
    expect(cashPayment.tenderedHalalas).toBe(cashAmount + 500);
    expect(cashPayment.changeHalalas).toBe(500);
  });

  it('cash tendered omitted defaults tendered = amount, change = 0', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    const payRes = await payViaPaymentsAndSubmit(orderId, [
      { methodId: 'cash', amountHalalas: totalHalalas },
    ]);

    expect(payRes.body.status).toBe('paid');

    const payments = db
      .select()
      .from(schema.orderPayments)
      .where(eq(schema.orderPayments.orderId, orderId))
      .all();
    expect(payments).toHaveLength(1);
    expect(payments[0].methodId).toBe('cash');
    expect(payments[0].tenderedHalalas).toBe(totalHalalas);
    expect(payments[0].changeHalalas).toBe(0);
  });

  describe('GET /orders/:id payments field', () => {
    it('paid order returns payments with method title and amount', async () => {
      const { orderId, totalHalalas } = await createOpenOrderWithItems();

      await payViaPaymentsAndSubmit(orderId, [{ methodId: 'card', amountHalalas: totalHalalas }]);

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.payments).toBeDefined();
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].id).toBeGreaterThan(0);
      expect(res.body.payments[0].createdAt).toBeGreaterThan(0);
      expect(res.body.payments[0].methodId).toBe('card');
      expect(res.body.payments[0].methodTitle).toBe('Card');
      expect(res.body.payments[0].amountHalalas).toBe(totalHalalas);
      expect(res.body.payments[0].tenderedHalalas).toBeNull();
      expect(res.body.payments[0].changeHalalas).toBeNull();
    });

    it('split tender returns both payment lines in insertion order', async () => {
      const { orderId, totalHalalas } = await createOpenOrderWithItems();

      const cardAmount = 2300;
      const cashAmount = totalHalalas - cardAmount;

      await payViaPaymentsAndSubmit(orderId, [
        { methodId: 'card', amountHalalas: cardAmount },
        { methodId: 'cash', amountHalalas: cashAmount },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.payments).toHaveLength(2);
      expect(res.body.payments[0].id).toBeGreaterThan(0);
      expect(res.body.payments[0].createdAt).toBeGreaterThan(0);
      expect(res.body.payments[0].methodId).toBe('card');
      expect(res.body.payments[0].methodTitle).toBe('Card');
      expect(res.body.payments[0].amountHalalas).toBe(cardAmount);
      expect(res.body.payments[1].id).toBeGreaterThan(res.body.payments[0].id);
      expect(res.body.payments[1].methodId).toBe('cash');
      expect(res.body.payments[1].methodTitle).toBe('Cash');
      expect(res.body.payments[1].amountHalalas).toBe(cashAmount);
    });

    it('open (unpaid) order returns empty payments array', async () => {
      const { orderId } = await createOpenOrderWithItems();

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.payments).toBeDefined();
      expect(res.body.payments).toHaveLength(0);
      expect(res.body.status).toBe('open');

      await voidOrder(orderId);
    });

    it('refunded order still shows original payments', async () => {
      const { orderId, totalHalalas, items } = await createOpenOrderWithItems();

      await payViaPaymentsAndSubmit(orderId, [{ methodId: 'cash', amountHalalas: totalHalalas }]);

      // Fully refund all items
      const refundItems = items.map((i: any) => ({
        orderItemId: i.id,
        qty: i.itemName === 'Zinger Burger' ? 2 : 1,
      }));
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: refundItems, methodId: 'cash' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 200));

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.status).toBe('refunded');
      expect(res.body.payments).toHaveLength(1);
      expect(res.body.payments[0].methodId).toBe('cash');
      expect(res.body.payments[0].amountHalalas).toBe(totalHalalas);
    });
  });

  describe('Standard invoice buyer fields', () => {
    async function createOpenOrderWithItemsAndSubmit(submitOverrides?: Partial<any>): Promise<{
      orderId: number;
      res: any;
    }> {
      // Create order with items (Zinger × 2)
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
          items: [{ itemId: 1, qty: 2 }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 100));

      const fetched = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Append the cash payment, then submit with the given body
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: fetched.body.totalHalalas })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/submit`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(submitOverrides || {});

      return { orderId, res };
    }

    it('submit without standard fields keeps is_standard_invoice=0, buyers null', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit();
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('paid');

      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(orderRes.body.isStandardInvoice).toBe(false);
      expect(orderRes.body.zatcaBuyerDetails).toBeNull();
    });

    const FULL_BUYER = {
      name: 'Abdullah Al-Otaibi Est.',
      vatNumber: '300123456789012',
      street: 'King Fahd Road',
      buildingNumber: '7845',
      citySubdivision: 'Al-Olaya',
      city: 'Riyadh',
      postalCode: '12271',
      country: 'SA',
    };

    it('submit with isStandardInvoice:true and full buyer → persisted correctly', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('paid');

      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(orderRes.body.isStandardInvoice).toBe(true);
      expect(orderRes.body.zatcaBuyerDetails).toBeDefined();
      expect(orderRes.body.zatcaBuyerDetails.name).toBe('Abdullah Al-Otaibi Est.');
      expect(orderRes.body.zatcaBuyerDetails.vatNumber).toBe('300123456789012');
      expect(orderRes.body.zatcaBuyerDetails.street).toBe('King Fahd Road');
      expect(orderRes.body.zatcaBuyerDetails.buildingNumber).toBe('7845');
      expect(orderRes.body.zatcaBuyerDetails.citySubdivision).toBe('Al-Olaya');
      expect(orderRes.body.zatcaBuyerDetails.city).toBe('Riyadh');
      expect(orderRes.body.zatcaBuyerDetails.postalCode).toBe('12271');
      expect(orderRes.body.zatcaBuyerDetails.country).toBe('SA');
    });

    it('isStandardInvoice:true defaults country to SA when omitted', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: {
          name: 'Test Co.',
          vatNumber: '300123456789013',
          street: 'Main St',
          buildingNumber: '1',
          citySubdivision: 'Central',
          city: 'Jeddah',
          postalCode: '22222',
        },
      });

      expect(res.status).toBe(201);

      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(orderRes.body.zatcaBuyerDetails.country).toBe('SA');
    });

    it('isStandardInvoice:true missing name → 400', async () => {
      const { res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: {
          ...FULL_BUYER,
          name: '',
        },
      });

      expect(res.status).toBe(400);
    });

    it('isStandardInvoice:true missing vatNumber → 400', async () => {
      const { res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: {
          ...FULL_BUYER,
          vatNumber: '',
        },
      });

      expect(res.status).toBe(400);
    });

    it('isStandardInvoice:true with invalid VAT format → 400', async () => {
      const { res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: {
          ...FULL_BUYER,
          vatNumber: '12345',
        },
      });

      expect(res.status).toBe(400);
    });

    it('isStandardInvoice:true with VAT containing letters → 400', async () => {
      const { res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: {
          ...FULL_BUYER,
          vatNumber: '30012345678901A',
        },
      });

      expect(res.status).toBe(400);
    });

    it('isStandardInvoice:true with invalid country code → 400', async () => {
      const { res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: {
          ...FULL_BUYER,
          country: 'SAU',
        },
      });

      expect(res.status).toBe(400);
    });

    it('submit paid event includes isStandardInvoice flag and buyer summary when standard', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });

      expect(res.status).toBe(201);

      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const paidEvent = eventsRes.body.find((e: any) => e.type === 'paid');
      expect(paidEvent).toBeDefined();
      const paidPayload =
        typeof paidEvent.payload === 'string' ? JSON.parse(paidEvent.payload) : paidEvent.payload;
      expect(paidPayload.isStandardInvoice).toBe(true);
      expect(paidPayload.buyerVatNumber).toBe('300123456789012');
      expect(paidPayload.buyerName).toBe('Abdullah Al-Otaibi Est.');
    });

    it('submit paid event does NOT include isStandardInvoice flag when not standard', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit();

      expect(res.status).toBe(201);

      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const paidEvent = eventsRes.body.find((e: any) => e.type === 'paid');
      expect(paidEvent).toBeDefined();
      const paidPayload =
        typeof paidEvent.payload === 'string' ? JSON.parse(paidEvent.payload) : paidEvent.payload;
      expect(paidPayload.isStandardInvoice).toBeUndefined();
      expect(paidPayload.buyerVatNumber).toBeUndefined();
      expect(paidPayload.buyerName).toBeUndefined();
    });

    it('isStandardInvoice:true missing zatcaBuyerDetails → 400', async () => {
      const { res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
      });

      expect(res.status).toBe(400);
    });

    it('isStandardInvoice:false ignores zatcaBuyerDetails entirely', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: false,
        zatcaBuyerDetails: FULL_BUYER,
      });

      expect(res.status).toBe(201);

      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(orderRes.body.isStandardInvoice).toBe(false);
      expect(orderRes.body.zatcaBuyerDetails).toBeNull();
    });

    it('standard submit does not enqueue receipt print immediately', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });

      expect(res.status).toBe(201);
      expect(res.body.invoiceType).toBe('standard');

      // Check events: receipt_print_enqueued should NOT be present for standard
      const eventsRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const types = eventsRes.body.map((e: any) => e.type);
      // Standard invoice pays defer the receipt print — only cash_drawer_kick_enqueued
      // may be present (for cash payments), but NOT receipt_print_enqueued
      expect(types).not.toContain('receipt_print_enqueued');
      // paid event should still contain standard invoice flags
      const paidEvent = eventsRes.body.find((e: any) => e.type === 'paid');
      expect(paidEvent).toBeDefined();
      const paidPayload =
        typeof paidEvent.payload === 'string' ? JSON.parse(paidEvent.payload) : paidEvent.payload;
      expect(paidPayload.isStandardInvoice).toBe(true);
    });

    it('GET /orders/:id/zatca-invoice returns invoiceType standard after standard submit', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });

      expect(res.status).toBe(201);

      const statusRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/zatca-invoice`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(statusRes.body.invoiceType).toBe('standard');
    });

    it('POST /orders/:id/zatca-invoice/reissue with no prior invoice returns 400', async () => {
      const { orderId } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });

      // No invoice yet created (no clearance module in this test), so reissue should fail
      const reissueRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/zatca-invoice/reissue`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ zatcaBuyerDetails: FULL_BUYER });

      // Expect 400 because no prior invoice exists
      expect(reissueRes.status).toBe(400);
    });

    it('POST /orders/:id/zatca-invoice/retry-clearance with no prior invoice returns 400', async () => {
      const { orderId } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });

      const retryRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/zatca-invoice/retry-clearance`)
        .set('Authorization', `Bearer ${jwtToken}`);

      // Expect 400 because no prior invoice exists
      expect(retryRes.status).toBe(400);
    });

    it('simple (non-standard) order gets invoiceType simplified from zatca-invoice', async () => {
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit();

      expect(res.status).toBe(201);

      const statusRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}/zatca-invoice`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(statusRes.body.invoiceType).toBe('simplified');
    });

    it('standard invoice refund defers receipt print until credit note clearance', async () => {
      // 1. Create a standard paid order
      const { orderId, res } = await createOpenOrderWithItemsAndSubmit({
        isStandardInvoice: true,
        zatcaBuyerDetails: FULL_BUYER,
      });
      expect(res.status).toBe(201);

      // 2. Refund via HTTP
      // Get order items to know what to refund
      const orderRes = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const zingerItem = orderRes.body.items[0];
      expect(zingerItem).toBeDefined();

      transport.sent = [];

      const refundRes = await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }], methodId: 'cash' })
        .expect(201);

      const refundId = refundRes.body.refundId;
      expect(refundId).toBeGreaterThan(0);

      // 3. Wait for any async work
      await new Promise((r) => setTimeout(r, 200));

      // 4. Immediately after refund: NO new receipt_print_enqueued for the refund
      const eventsBefore = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const typesBefore = eventsBefore.body.map((e: any) => e.type);
      expect(typesBefore).toContain('refund_issued');
      // For standard orders, no receipt_print_enqueued should be generated during refund
      // (the pay also skips receipt_print, so there should be 0 enqueued events overall)
      expect(typesBefore).not.toContain('receipt_print_enqueued');

      // 5. Simulate credit note clearance by calling the event handler directly
      const ordersService = app.get(OrdersService);
      // The userId from the login is always 1 (admin seed user)
      await ordersService.onZatcaCreditNoteCleared({
        orderId,
        userId: 1,
        creditNoteId: 999, // placeholder — not actually read by the handler
        refundId,
      });

      // Wait for async print
      await new Promise((r) => setTimeout(r, 200));

      // 6. After clearance: receipt print events should appear
      const eventsAfter = await request(app.getHttpServer())
        .get(`/orders/${orderId}/events`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      const typesAfter = eventsAfter.body.map((e: any) => e.type);
      expect(typesAfter).toContain('receipt_print_enqueued');
      expect(typesAfter).toContain('receipt_print_succeeded');
    });
  });
});

describe('Add payment (append) — POST /orders/:id/payments (ADR 0006)', () => {
  // Open order with 2× Zinger Burger (total 4600 halalas), status stays open
  async function createOpenOrderWithItems(): Promise<{
    orderId: number;
    totalHalalas: number;
  }> {
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
        items: [{ itemId: 1, qty: 2 }],
      })
      .expect(200);

    const fetched = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    return { orderId, totalHalalas: fetched.body.totalHalalas };
  }

  function paymentSum(orderId: number): number {
    const rows = db
      .select()
      .from(schema.orderPayments)
      .where(eq(schema.orderPayments.orderId, orderId))
      .all();
    return rows.reduce((s: number, r: any) => s + r.amountHalalas, 0);
  }

  it('happy path: cash payment appends a line, status stays open, payment_added event, no paid event', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas })
      .expect(201);

    // Status unchanged
    expect(res.body.status).toBe('open');

    // Payments array: one line with full shape (id + createdAt included)
    expect(res.body.payments).toHaveLength(1);
    const p = res.body.payments[0];
    expect(p.id).toBeGreaterThan(0);
    expect(p.methodId).toBe('cash');
    expect(p.methodTitle).toBe('Cash');
    expect(p.zatcaPaymentMeansCode).toBe('10');
    expect(p.amountHalalas).toBe(totalHalalas);
    expect(p.tenderedHalalas).toBe(totalHalalas);
    expect(p.changeHalalas).toBe(0);
    expect(p.createdAt).toBeGreaterThan(0);

    // DB row persisted
    expect(paymentSum(orderId)).toBe(totalHalalas);

    // Events: payment_added present, paid absent
    const eventsRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const types = eventsRes.body.map((e: any) => e.type);
    expect(types).toContain('payment_added');
    expect(types).not.toContain('paid');

    const added = eventsRes.body.find((e: any) => e.type === 'payment_added');
    const payload = typeof added.payload === 'string' ? JSON.parse(added.payload) : added.payload;
    expect(payload.paymentId).toBe(p.id);
    expect(payload.methodId).toBe('cash');
    expect(payload.methodTitle).toBe('Cash');
    expect(payload.zatcaPaymentMeansCode).toBe('10');
    expect(payload.amountHalalas).toBe(totalHalalas);
    expect(payload.tenderedHalalas).toBe(totalHalalas);
    expect(payload.changeHalalas).toBe(0);

    // updated_at bumped (audit fields)
    expect(res.body.updatedBy).toBe(1);
  });

  it('negative correction after overpay: pay 100 then −20 → net 80', async () => {
    const { orderId } = await createOpenOrderWithItems();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 100 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: -20 })
      .expect(201);

    expect(res.body.status).toBe('open');
    expect(res.body.payments).toHaveLength(2);
    expect(paymentSum(orderId)).toBe(80);

    // Negative cash line: no tendered/change in DB or event payload
    const neg = res.body.payments[1];
    expect(neg.amountHalalas).toBe(-20);
    expect(neg.tenderedHalalas).toBeNull();
    expect(neg.changeHalalas).toBeNull();

    const eventsRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const addedEvents = eventsRes.body.filter((e: any) => e.type === 'payment_added');
    expect(addedEvents).toHaveLength(2);
    const negPayload = JSON.parse(addedEvents[1].payload);
    expect(negPayload.amountHalalas).toBe(-20);
    expect(negPayload.tenderedHalalas).toBeUndefined();
    expect(negPayload.changeHalalas).toBeUndefined();
  });

  it('rejects amount 0 (400)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 0 })
      .expect(400);

    expect(res.body.message).toBeDefined();
    expect(paymentSum(orderId)).toBe(0);
  });

  it('rejects a line that would push the net sum negative (first line −50)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: -50 })
      .expect(400);

    // Nothing persisted
    expect(paymentSum(orderId)).toBe(0);
    const eventsRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(eventsRes.body.some((e: any) => e.type === 'payment_added')).toBe(false);
  });

  it('rejects payment on an empty order (no items) (400)', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 100 })
      .expect(400);

    expect(res.body.message).toContain('without items');
  });

  it('rejects payment on a non-open order (400)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    // Finalize via payments + submit (status becomes paid)
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 100 })
      .expect(400);
  });

  it('rejects unknown payment method (400)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'bitcoin', amountHalalas: 100 })
      .expect(400);
  });

  it('rejects disabled payment method (400)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    db.update(schema.paymentMethods)
      .set({ enabled: 0 })
      .where(eq(schema.paymentMethods.id, 'mada'))
      .run();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'mada', amountHalalas: 100 })
      .expect(400);

    db.update(schema.paymentMethods)
      .set({ enabled: 1 })
      .where(eq(schema.paymentMethods.id, 'mada'))
      .run();
  });

  it('rejects tendered on non-cash method (400)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'card', amountHalalas: 100, tenderedHalalas: 100 })
      .expect(400);
  });

  it('rejects tendered on negative cash line (400)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: -20, tenderedHalalas: 20 })
      .expect(400);
  });

  it('rejects cash tendered < amount (400)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 100, tenderedHalalas: 99 })
      .expect(400);
  });

  it('multiple lines with the same method are allowed (two cash rows)', async () => {
    const { orderId } = await createOpenOrderWithItems();

    const res1 = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 1000 })
      .expect(201);
    expect(res1.body.payments).toHaveLength(1);

    const res2 = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: 1000 })
      .expect(201);

    expect(res2.body.payments).toHaveLength(2);
    const cashLines = res2.body.payments.filter((p: any) => p.methodId === 'cash');
    expect(cashLines).toHaveLength(2);
    expect(paymentSum(orderId)).toBe(2000);
    expect(res2.body.status).toBe('open');
  });

  it('temporary overpay is allowed while open (sum > total)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas + 400 })
      .expect(201);

    expect(res.body.status).toBe('open');
    expect(paymentSum(orderId)).toBe(totalHalalas + 400);
  });

  describe('void net-zero guard (ADR 0006)', () => {
    it('void with no payments still works', async () => {
      const { orderId } = await createOpenOrderWithItems();

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      expect(res.body.status).toBe('voided');
    });

    it('void after payments that net to 0 (+100 then −100) works', async () => {
      const { orderId } = await createOpenOrderWithItems();

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 100 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: -100 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);

      expect(res.body.status).toBe('voided');
    });

    it('void with net payments ≠ 0 returns 400 with guidance', async () => {
      const { orderId } = await createOpenOrderWithItems();

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: 100 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(400);

      expect(res.body.message).toContain('net 100 halalas');
      expect(res.body.message).toContain('balancing payment lines');

      // Order still open — balance it so it can be voided
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ methodId: 'cash', amountHalalas: -100 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(201);
    });
  });
});

describe('One open order per table', () => {
  let openOrderIds: number[];

  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (2, 'T2', 1, 1, ${now}, ${now});
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (3, 'T3', 2, 1, ${now}, ${now});
    `);
  });

  beforeEach(() => {
    openOrderIds = [];
  });

  afterEach(async () => {
    // Void any open orders created during this test to keep the DB clean
    for (const id of openOrderIds) {
      try {
        await request(app.getHttpServer())
          .post(`/orders/${id}/void`)
          .set('Authorization', `Bearer ${jwtToken}`);
      } catch {
        // Order may already be paid/voided — ignore
      }
    }
  });

  async function createOpenDineIn(tableId: number): Promise<{ id: number; orderNo: number }> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId })
      .expect(201);
    openOrderIds.push(res.body.id);
    return res.body;
  }

  async function createOpenTakeaway(): Promise<{ id: number; orderNo: number }> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    return res.body;
  }

  it('second open dine-in on same table → 409 Conflict', async () => {
    const first = await createOpenDineIn(2);

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: 2 })
      .expect(409);

    expect(res.body.message).toBe(
      `Table already has an open order #${first.orderNo} (id ${first.id}).`,
    );
  });

  it('after pay of first order, new dine-in on same table → 201', async () => {
    const first = await createOpenDineIn(2);

    // Void the first order (no items to pay)
    await request(app.getHttpServer())
      .post(`/orders/${first.id}/void`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);

    // Now creating a new dine-in on same table should succeed
    const second = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: 2 })
      .expect(201);
    openOrderIds.push(second.body.id);
  });

  it('after void of first order, new dine-in on same table → 201', async () => {
    const first = await createOpenDineIn(2);

    // Void the first order
    await request(app.getHttpServer())
      .post(`/orders/${first.id}/void`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);

    // Now creating a new dine-in on same table should succeed
    const second = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: 2 })
      .expect(201);
    openOrderIds.push(second.body.id);
  });

  it('two takeaway open orders → both 201', async () => {
    await createOpenTakeaway();
    await createOpenTakeaway();
    // No conflict expected — takeaway orders have no table
  });

  it('open dine-in on table A and table B → both 201', async () => {
    await createOpenDineIn(2);
    await createOpenDineIn(3);
    // Both should succeed — different tables
  });

  it('conflict message includes order number', async () => {
    const first = await createOpenDineIn(2);

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: 2 })
      .expect(409);

    expect(res.body.message).toContain(`#${first.orderNo}`);
    expect(res.body.message).toContain(`id ${first.id}`);
  });
});

describe('updateOrderMeta (PATCH /orders/:id)', () => {
  const TABLE_A = 10;
  const TABLE_B = 11;
  const TABLE_INACTIVE = 12;
  let metaOrderIds: number[];

  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (${TABLE_A}, 'TA', 10, 1, ${now}, ${now});
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (${TABLE_B}, 'TB', 11, 1, ${now}, ${now});
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (${TABLE_INACTIVE}, 'TI', 12, 0, ${now}, ${now});
    `);
  });

  beforeEach(() => {
    metaOrderIds = [];
  });

  afterEach(async () => {
    // Void any open orders created during this test to keep the DB clean
    for (const id of metaOrderIds) {
      try {
        await request(app.getHttpServer())
          .post(`/orders/${id}/void`)
          .set('Authorization', `Bearer ${jwtToken}`);
      } catch {
        // Order may already be paid/voided — ignore
      }
    }
  });

  async function createOrder(body: Record<string, unknown>): Promise<any> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body)
      .expect(201);
    metaOrderIds.push(res.body.id);
    return res.body;
  }

  async function getOrder(id: number): Promise<any> {
    const res = await request(app.getHttpServer())
      .get(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    return res.body;
  }

  // Returns the supertest chain — supports both `.expect(...)` chaining
  // and `await` (resolves to the response).
  function patchOrder(id: number, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body);
  }

  it('open takeaway → dine-in + table: 200, DB type/table + type_changed event payload correct', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    // Ensure updated_at ticks past creation time before the PATCH
    await new Promise((r) => setTimeout(r, 1500));

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
    }).expect(200);

    expect(res.body.type).toBe('dine_in');
    expect(res.body.tableId).toBe(TABLE_A);
    expect(res.body.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(res.body.updatedBy).not.toBeNull();

    // OrderResponse contract: boolean isStandardInvoice + payments array
    expect(typeof res.body.isStandardInvoice).toBe('boolean');
    expect(res.body.isStandardInvoice).toBe(false);
    expect(Array.isArray(res.body.payments)).toBe(true);

    // Persisted in DB
    const dbOrder: any = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
    expect(dbOrder.type).toBe('dine_in');
    expect(dbOrder.tableId).toBe(TABLE_A);

    // Event written with from/to payload
    const changed = res.body.events.filter((e: any) => e.type === 'type_changed');
    expect(changed).toHaveLength(1);
    const payload = JSON.parse(changed[0].payload);
    expect(payload).toEqual({
      fromType: 'takeaway',
      toType: 'dine_in',
      fromTableId: null,
      toTableId: TABLE_A,
    });
  });

  it('open dine-in → other free table: 200', async () => {
    const { id } = await createOrder({ type: 'dine_in', tableId: TABLE_A });
    const before = await getOrder(id);

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_B,
    }).expect(200);

    expect(res.body.type).toBe('dine_in');
    expect(res.body.tableId).toBe(TABLE_B);
    const payload = JSON.parse(
      res.body.events.filter((e: any) => e.type === 'type_changed')[0].payload,
    );
    expect(payload.fromTableId).toBe(TABLE_A);
    expect(payload.toTableId).toBe(TABLE_B);
  });

  it('open dine-in → table with another open order: 409 same message style as create', async () => {
    const other = await createOrder({ type: 'dine_in', tableId: TABLE_A });
    const mine = await createOrder({ type: 'dine_in', tableId: TABLE_B });
    const before = await getOrder(mine.id);

    const res = await patchOrder(mine.id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
    }).expect(409);

    expect(res.body.message).toBe(
      `Table already has an open order #${other.orderNo} (id ${other.id}).`,
    );
  });

  it('open dine-in → takeaway: table_id null, previous table free for new create', async () => {
    const { id } = await createOrder({ type: 'dine_in', tableId: TABLE_A });
    const before = await getOrder(id);

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
      // Sending a non-null tableId with takeaway is ignored (force-null, D4)
      tableId: TABLE_A,
    }).expect(200);

    expect(res.body.type).toBe('takeaway');
    expect(res.body.tableId).toBeNull();

    const payload = JSON.parse(
      res.body.events.filter((e: any) => e.type === 'type_changed')[0].payload,
    );
    expect(payload.fromType).toBe('dine_in');
    expect(payload.toType).toBe('takeaway');
    expect(payload.fromTableId).toBe(TABLE_A);
    expect(payload.toTableId).toBeNull();

    // Table released — a new dine-in on the same table succeeds
    const fresh = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: TABLE_A })
      .expect(201);
    metaOrderIds.push(fresh.body.id);
  });

  it('voided order → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    await request(app.getHttpServer())
      .post(`/orders/${id}/void`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);
    const before = await getOrder(id);

    await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
    }).expect(400);
  });

  it('paid order → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    // Add an item so the order has a total to pay, then finalize via submit
    const syncRes = await request(app.getHttpServer())
      .put(`/orders/${id}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: before.updatedAt, items: [{ itemId: 1, qty: 1 }] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/orders/${id}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: syncRes.body.totalHalalas })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${id}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    const paidOrder = await getOrder(id);
    await patchOrder(id, {
      baseUpdatedAt: paidOrder.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
    }).expect(400);
  });

  it('stale baseUpdatedAt → 409 with updatedAt', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    // Ensure updated_at ticks past creation time before the sync
    await new Promise((r) => setTimeout(r, 1500));

    // Bump updated_at via item sync
    await request(app.getHttpServer())
      .put(`/orders/${id}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: before.updatedAt, items: [{ itemId: 1, qty: 1 }] })
      .expect(200);

    const after = await getOrder(id);
    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt, // stale
      type: 'dine_in',
      tableId: TABLE_A,
    }).expect(409);

    expect(res.body.message).toBe(
      'Order was modified by another terminal. Please refresh your cart.',
    );
    expect(res.body.updatedAt).toBe(after.updatedAt);
  }, 10000);

  it('dine-in without tableId → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
    }).expect(400);
  });

  it('inactive table → 404', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_INACTIVE,
    }).expect(404);
  });

  it('missing table → 404', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: 99999,
    }).expect(404);
  });

  it('no-op same type+table → 200, no new type_changed event, updatedAt unchanged', async () => {
    const { id } = await createOrder({ type: 'dine_in', tableId: TABLE_A });
    const before = await getOrder(id);
    const eventCountBefore = before.events.length;

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
    }).expect(200);

    expect(res.body.type).toBe('dine_in');
    expect(res.body.tableId).toBe(TABLE_A);
    expect(res.body.updatedAt).toBe(before.updatedAt);
    expect(res.body.events.length).toBe(eventCountBefore);
    expect(res.body.events.filter((e: any) => e.type === 'type_changed')).toHaveLength(0);
  });

  it('no-op takeaway (no table) → 200, no event', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const eventCountBefore = before.events.length;

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
    }).expect(200);

    expect(res.body.type).toBe('takeaway');
    expect(res.body.tableId).toBeNull();
    expect(res.body.updatedAt).toBe(before.updatedAt);
    expect(res.body.events.length).toBe(eventCountBefore);
  });

  // ── Order notes (order-level remarks) ────────────────────────────────────

  it('create with notes → 201, GET returns notes, created event carries notes', async () => {
    const { id } = await createOrder({ type: 'takeaway', notes: 'call on arrival' });
    const order = await getOrder(id);

    expect(order.notes).toBe('call on arrival');
    const createdEvent = order.events.find((e: any) => e.type === 'created');
    const payload = JSON.parse(createdEvent.payload);
    expect(payload.notes).toBe('call on arrival');

    // Create without notes → null + no notes key in the created payload
    const plain = await createOrder({ type: 'takeaway' });
    const plainOrder = await getOrder(plain.id);
    expect(plainOrder.notes).toBeNull();
    const plainCreated = plainOrder.events.find((e: any) => e.type === 'created');
    expect(JSON.parse(plainCreated.payload).notes).toBeUndefined();
  });

  it('PATCH notes-only (same type/table) → 200, notes_changed event, no kitchen prints', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    // Ensure updated_at ticks past creation time before the PATCH
    await new Promise((r) => setTimeout(r, 1500));
    transport.sent = [];

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
      notes: 'call on arrival',
    }).expect(200);

    expect(res.body.notes).toBe('call on arrival');
    expect(res.body.type).toBe('takeaway');
    expect(res.body.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(res.body.updatedBy).not.toBeNull();

    // DB persisted
    const dbOrder: any = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
    expect(dbOrder.notes).toBe('call on arrival');

    // One notes_changed event with from/to payload; no type_changed
    const notesChanged = res.body.events.filter((e: any) => e.type === 'notes_changed');
    expect(notesChanged).toHaveLength(1);
    expect(JSON.parse(notesChanged[0].payload)).toEqual({
      fromNotes: null,
      toNotes: 'call on arrival',
    });
    expect(res.body.events.filter((e: any) => e.type === 'type_changed')).toHaveLength(0);

    // Notes-only change must NOT enqueue kitchen prints (ADR 0006)
    expect(transport.sent).toHaveLength(0);
  });

  it('notes-only PATCH on dine-in: no partner clear, no line price reset events', async () => {
    const { id } = await createOrder({ type: 'dine_in', tableId: TABLE_A, notes: null });
    const before = await getOrder(id);

    // Ensure updated_at ticks past creation time before the PATCH
    await new Promise((r) => setTimeout(r, 1500));

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
      notes: 'allergy',
    }).expect(200);

    // Notes saved, type/table untouched
    expect(res.body.notes).toBe('allergy');
    expect(res.body.type).toBe('dine_in');
    expect(res.body.tableId).toBe(TABLE_A);

    // Exactly one notes_changed; nothing else (ADR 0007 block must not run
    // for notes-only patches — regression: it used to run on every dine_in
    // patch and could write spurious delivery_partner_changed /
    // item_price_reset events).
    const notesChanged = res.body.events.filter((e: any) => e.type === 'notes_changed');
    expect(notesChanged).toHaveLength(1);
    expect(JSON.parse(notesChanged[0].payload)).toEqual({
      fromNotes: null,
      toNotes: 'allergy',
    });
    expect(res.body.events.filter((e: any) => e.type === 'type_changed')).toHaveLength(0);
    expect(res.body.events.filter((e: any) => e.type === 'delivery_partner_changed')).toHaveLength(
      0,
    );
    expect(res.body.events.filter((e: any) => e.type === 'item_price_reset')).toHaveLength(0);
  });

  it('clears notes via empty string → null (normalized)', async () => {
    const { id } = await createOrder({ type: 'takeaway', notes: 'call on arrival' });
    const before = await getOrder(id);

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
      notes: '',
    }).expect(200);

    expect(res.body.notes).toBeNull();
    const notesChanged = res.body.events.filter((e: any) => e.type === 'notes_changed');
    expect(notesChanged).toHaveLength(1);
    expect(JSON.parse(notesChanged[0].payload)).toEqual({
      fromNotes: 'call on arrival',
      toNotes: null,
    });
  });

  it('clears notes via null → null', async () => {
    const { id } = await createOrder({ type: 'takeaway', notes: 'call on arrival' });
    const before = await getOrder(id);

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
      notes: null,
    }).expect(200);

    expect(res.body.notes).toBeNull();
    const notesChanged = res.body.events.filter((e: any) => e.type === 'notes_changed');
    expect(notesChanged).toHaveLength(1);
    expect(JSON.parse(notesChanged[0].payload)).toEqual({
      fromNotes: 'call on arrival',
      toNotes: null,
    });
  });

  it('same notes value → 200 no-op (no updated_at bump, no event)', async () => {
    const { id } = await createOrder({ type: 'takeaway', notes: 'keep' });
    const before = await getOrder(id);
    const eventCountBefore = before.events.length;

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
      notes: 'keep',
    }).expect(200);

    expect(res.body.notes).toBe('keep');
    expect(res.body.updatedAt).toBe(before.updatedAt);
    expect(res.body.events.length).toBe(eventCountBefore);
    expect(res.body.events.filter((e: any) => e.type === 'notes_changed')).toHaveLength(0);
  });

  it('notes + type change in one PATCH → 200, both events written', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    // Ensure updated_at ticks past creation time before the PATCH
    await new Promise((r) => setTimeout(r, 1500));

    const res = await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'dine_in',
      tableId: TABLE_A,
      notes: 'window seat',
    }).expect(200);

    expect(res.body.type).toBe('dine_in');
    expect(res.body.tableId).toBe(TABLE_A);
    expect(res.body.notes).toBe('window seat');

    const notesChanged = res.body.events.filter((e: any) => e.type === 'notes_changed');
    expect(notesChanged).toHaveLength(1);
    expect(JSON.parse(notesChanged[0].payload)).toEqual({
      fromNotes: null,
      toNotes: 'window seat',
    });
    const typeChanged = res.body.events.filter((e: any) => e.type === 'type_changed');
    expect(typeChanged).toHaveLength(1);
  });

  it('notes-only PATCH on a voided order → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    await request(app.getHttpServer())
      .post(`/orders/${id}/void`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);
    const before = await getOrder(id);

    await patchOrder(id, {
      baseUpdatedAt: before.updatedAt,
      type: 'takeaway',
      notes: 'too late',
    }).expect(400);
  });

  it('missing order → 404', async () => {
    await patchOrder(999999, {
      baseUpdatedAt: 0,
      type: 'takeaway',
    }).expect(404);
  });
});

describe('Delivery partner — PATCH /orders/:id/partner (ADR 0007)', () => {
  // Partner catalog seeds. 'ghost' is soft-disabled (enabled = 0).
  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('hungerstation', 'HungerStation', 1, 0, ${now}, ${now});
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('keeta', 'Keeta', 1, 1, ${now}, ${now});
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('ghost', 'Ghost', 0, 2, ${now}, ${now});
    `);
  });

  let partnerOrderIds: number[];

  beforeEach(() => {
    partnerOrderIds = [];
  });

  afterEach(async () => {
    // Void any open orders created during this test to keep the DB clean
    for (const id of partnerOrderIds) {
      try {
        await request(app.getHttpServer())
          .post(`/orders/${id}/void`)
          .set('Authorization', `Bearer ${jwtToken}`);
      } catch {
        // Order may already be paid/voided — ignore
      }
    }
  });

  async function createOrder(body: Record<string, unknown>): Promise<any> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body)
      .expect(201);
    partnerOrderIds.push(res.body.id);
    return res.body;
  }

  async function getOrder(id: number): Promise<any> {
    const res = await request(app.getHttpServer())
      .get(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    return res.body;
  }

  // Returns the supertest chain — supports both `.expect(...)` chaining
  // and `await` (resolves to the response).
  function patchPartner(id: number, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/orders/${id}/partner`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body);
  }

  async function addItem(orderId: number, updatedAt: number, itemId = 1, qty = 1): Promise<any> {
    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: updatedAt, items: [{ itemId, qty }] })
      .expect(200);
    return res.body;
  }

  function setLinePrice(orderId: number, priceHalalas: number): void {
    sqlite.exec(
      `UPDATE order_items SET unit_price_halalas = ${priceHalalas}, total_halalas = ${priceHalalas} * qty WHERE order_id = ${orderId}`,
    );
  }

  it('set partner on takeaway open order: 200, ref stored, partner title in response, prices untouched', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 2);

    const res = await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-123',
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBe('hungerstation');
    expect(res.body.deliveryPartnerTitle).toBe('HungerStation');
    expect(res.body.deliveryExternalRef).toBe('HS-123');
    // Set partner never touches line prices (ADR 0007)
    expect(res.body.items[0].unitPriceHalalas).toBe(2300);
    expect(res.body.totalHalalas).toBe(4600);

    // Persisted in DB
    const dbOrder: any = db.select().from(schema.orders).where(eq(schema.orders.id, id)).get();
    expect(dbOrder.deliveryPartnerId).toBe('hungerstation');
    expect(dbOrder.deliveryExternalRef).toBe('HS-123');

    const evts = res.body.events.filter((e: any) => e.type === 'delivery_partner_changed');
    expect(evts).toHaveLength(1);
    expect(JSON.parse(evts[0].payload)).toEqual({
      fromPartnerId: null,
      toPartnerId: 'hungerstation',
      fromPartnerTitle: null,
      toPartnerTitle: 'HungerStation',
      fromExternalRef: null,
      toExternalRef: 'HS-123',
      resetItemCount: 0,
    });
    // No price resets on set
    expect(res.body.events.filter((e: any) => e.type === 'item_price_reset')).toHaveLength(0);
  });

  it('set partner on dine_in order → 400 with guidance', async () => {
    const { id } = await createOrder({ type: 'dine_in', tableId: 1 });
    const before = await getOrder(id);

    const res = await patchPartner(id, {
      baseUpdatedAt: before.updatedAt,
      deliveryPartnerId: 'hungerstation',
    }).expect(400);
    expect(res.body.message).toBe('Set order type to takeaway first');
  });

  it('unknown or disabled partner → 400', async () => {
    const a = await createOrder({ type: 'takeaway' });
    const beforeA = await getOrder(a.id);
    const resUnknown = await patchPartner(a.id, {
      baseUpdatedAt: beforeA.updatedAt,
      deliveryPartnerId: 'nonexistent',
    }).expect(400);
    expect(resUnknown.body.message).toBe('Unknown delivery partner "nonexistent"');

    const b = await createOrder({ type: 'takeaway' });
    const beforeB = await getOrder(b.id);
    const resDisabled = await patchPartner(b.id, {
      baseUpdatedAt: beforeB.updatedAt,
      deliveryPartnerId: 'ghost',
    }).expect(400);
    expect(resDisabled.body.message).toBe('Delivery partner "ghost" is disabled');
  });

  it('change partner swaps the slug and never touches line prices (ADR 0007)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const _synced = await addItem(id, before.updatedAt, 1, 1);

    // Simulate a Phase-7-style manual override (no endpoint yet): set the
    // line off-catalog directly in the DB.
    setLinePrice(id, 2500);

    const overridden = await getOrder(id);
    const set = await patchPartner(id, {
      baseUpdatedAt: overridden.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-1',
    }).expect(200);
    expect(set.body.items[0].unitPriceHalalas).toBe(2500);

    const afterSet = await getOrder(id);
    const change = await patchPartner(id, {
      baseUpdatedAt: afterSet.updatedAt,
      deliveryPartnerId: 'keeta',
      deliveryExternalRef: 'K-2',
    }).expect(200);

    expect(change.body.deliveryPartnerId).toBe('keeta');
    expect(change.body.deliveryPartnerTitle).toBe('Keeta');
    expect(change.body.items[0].unitPriceHalalas).toBe(2500); // still overridden

    // No price resets on set/change
    expect(change.body.events.filter((e: any) => e.type === 'item_price_reset')).toHaveLength(0);
  });

  it('change partner without a ref keeps the existing ref (edited separately)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);

    const set = await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-1',
    }).expect(200);

    const res = await patchPartner(id, {
      baseUpdatedAt: set.body.updatedAt,
      deliveryPartnerId: 'keeta',
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBe('keeta');
    expect(res.body.deliveryExternalRef).toBe('HS-1');
  });

  it('clear partner resets line prices to the live catalog, nulls ref, writes events', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const _synced = await addItem(id, before.updatedAt, 1, 2);
    setLinePrice(id, 2500);

    const overridden = await getOrder(id);
    const set = await patchPartner(id, {
      baseUpdatedAt: overridden.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-1',
    }).expect(200);

    const res = await patchPartner(id, {
      baseUpdatedAt: set.body.updatedAt,
      deliveryPartnerId: null,
      // A ref sent alongside a clear is ignored / force-nulled
      deliveryExternalRef: 'HS-BOGUS',
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBeNull();
    expect(res.body.deliveryExternalRef).toBeNull();
    expect(res.body.items[0].unitPriceHalalas).toBe(2300); // catalog price
    expect(res.body.items[0].totalHalalas).toBe(4600);
    expect(res.body.totalHalalas).toBe(4600); // totals recomputed

    const partnerEvts = res.body.events.filter((e: any) => e.type === 'delivery_partner_changed');
    expect(partnerEvts).toHaveLength(2); // set + clear
    expect(JSON.parse(partnerEvts[1].payload)).toEqual({
      fromPartnerId: 'hungerstation',
      toPartnerId: null,
      fromPartnerTitle: 'HungerStation',
      toPartnerTitle: null,
      fromExternalRef: 'HS-1',
      toExternalRef: null,
      resetItemCount: 1,
    });

    const resets = res.body.events.filter((e: any) => e.type === 'item_price_reset');
    expect(resets).toHaveLength(1);
    expect(JSON.parse(resets[0].payload)).toMatchObject({
      orderItemId: res.body.items[0].id,
      itemId: 1,
      fromUnitPriceHalalas: 2500,
      toUnitPriceHalalas: 2300,
      reason: 'partner_cleared',
    });
  });

  it('lines with item_id NULL keep their price on clear (no reset event for them)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);
    const orderItemId = synced.items[0].id;

    // Simulate a legacy/orphan line: no catalog link, custom price.
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${id}, NULL, 'Legacy Special', 2000, 1500, 1, 2000, ${synced.updatedAt}, ${synced.updatedAt});
    `);
    // Push the catalog line off-catalog, then restore the legacy line's price
    setLinePrice(id, 2500);
    sqlite.exec(
      `UPDATE order_items SET unit_price_halalas = 2000, total_halalas = 2000 * qty WHERE order_id = ${id} AND item_id IS NULL`,
    );

    const overridden = await getOrder(id);
    expect(overridden.items).toHaveLength(2);

    const set = await patchPartner(id, {
      baseUpdatedAt: overridden.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-1',
    }).expect(200);

    const res = await patchPartner(id, {
      baseUpdatedAt: set.body.updatedAt,
      deliveryPartnerId: null,
    }).expect(200);

    const byId = new Map<number, any>(res.body.items.map((i: any) => [i.id, i]));
    expect(byId.get(orderItemId).unitPriceHalalas).toBe(2300); // reset to catalog
    const legacy = [...byId.values()].find((i: any) => i.itemId === null);
    expect(legacy.unitPriceHalalas).toBe(2000); // kept as-is

    // Only the catalog line got a reset event; totals = 2300 + 2000
    const resets = res.body.events.filter((e: any) => e.type === 'item_price_reset');
    expect(resets).toHaveLength(1);
    expect(JSON.parse(resets[0].payload)).toMatchObject({
      orderItemId,
      reason: 'partner_cleared',
    });
    expect(res.body.totalHalalas).toBe(4300);

    const partnerEvts = res.body.events.filter((e: any) => e.type === 'delivery_partner_changed');
    expect(JSON.parse(partnerEvts[partnerEvts.length - 1].payload).resetItemCount).toBe(1);
  });

  it('ref-only edit when partner set: ref updated, delivery_partner_changed written, prices untouched', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);

    const set = await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-1',
    }).expect(200);

    const res = await patchPartner(id, {
      baseUpdatedAt: set.body.updatedAt,
      deliveryExternalRef: 'HS-2',
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBe('hungerstation');
    expect(res.body.deliveryExternalRef).toBe('HS-2');

    const evts = res.body.events.filter((e: any) => e.type === 'delivery_partner_changed');
    expect(evts).toHaveLength(2);
    expect(JSON.parse(evts[1].payload)).toEqual({
      fromPartnerId: 'hungerstation',
      toPartnerId: 'hungerstation',
      fromPartnerTitle: 'HungerStation',
      toPartnerTitle: 'HungerStation',
      fromExternalRef: 'HS-1',
      toExternalRef: 'HS-2',
      resetItemCount: 0,
    });
    expect(res.body.events.filter((e: any) => e.type === 'item_price_reset')).toHaveLength(0);
  });

  it('ref-only edit without a partner → no-op: ref force-nulled, no events, no bump', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);
    const eventCount = synced.events.length;

    const res = await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryExternalRef: 'HS-X',
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBeNull();
    expect(res.body.deliveryExternalRef).toBeNull();
    expect(res.body.updatedAt).toBe(synced.updatedAt);
    expect(res.body.events.length).toBe(eventCount);
  });

  it('clear on an already-partnerless order → no-op (no events, no bump)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);
    const eventCount = synced.events.length;

    const res = await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryPartnerId: null,
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBeNull();
    expect(res.body.updatedAt).toBe(synced.updatedAt);
    expect(res.body.events.length).toBe(eventCount);
  });

  it('body without deliveryPartnerId or deliveryExternalRef → no-op (keeps partner and ref)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);

    const set = await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-1',
    }).expect(200);
    const eventCount = set.body.events.length;

    const res = await patchPartner(id, {
      baseUpdatedAt: set.body.updatedAt,
    }).expect(200);

    expect(res.body.deliveryPartnerId).toBe('hungerstation');
    expect(res.body.deliveryExternalRef).toBe('HS-1'); // not cleared
    expect(res.body.updatedAt).toBe(set.body.updatedAt);
    expect(res.body.events.length).toBe(eventCount);
  });

  it('stale baseUpdatedAt → 409 with updatedAt', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);

    // Ensure updated_at ticks past creation time before the sync
    await new Promise((r) => setTimeout(r, 1500));
    const synced = await addItem(id, before.updatedAt, 1, 1);

    const res = await patchPartner(id, {
      baseUpdatedAt: before.updatedAt, // stale
      deliveryPartnerId: 'hungerstation',
    }).expect(409);

    expect(res.body.message).toBe(
      'Order was modified by another terminal. Please refresh your cart.',
    );
    expect(res.body.updatedAt).toBe(synced.updatedAt);
  }, 10000);

  it('paid order partner patch → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);

    await request(app.getHttpServer())
      .post(`/orders/${id}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: synced.totalHalalas })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${id}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    const paid = await getOrder(id);
    const res = await patchPartner(id, {
      baseUpdatedAt: paid.updatedAt,
      deliveryPartnerId: 'hungerstation',
    }).expect(400);
    expect(res.body.message).toBe('Only open orders can change the delivery partner');
  });

  it('GET /orders list includes deliveryPartnerId + title when set', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);

    await patchPartner(id, {
      baseUpdatedAt: synced.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-77',
    }).expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/orders?status=open')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const mine = listRes.body.find((o: any) => o.id === id);
    expect(mine.deliveryPartnerId).toBe('hungerstation');
    expect(mine.deliveryPartnerTitle).toBe('HungerStation');
    expect(mine.deliveryExternalRef).toBe('HS-77');
  });

  // ── takeaway → dine_in side effects (ADR 0007 extends ADR 0004) ────────────

  it('takeaway → dine_in clears partner/ref, resets prices, writes all events', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const _synced = await addItem(id, before.updatedAt, 1, 1);
    setLinePrice(id, 2500);

    const overridden = await getOrder(id);
    const set = await patchPartner(id, {
      baseUpdatedAt: overridden.updatedAt,
      deliveryPartnerId: 'hungerstation',
      deliveryExternalRef: 'HS-9',
    }).expect(200);

    const res = await request(app.getHttpServer())
      .patch(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: set.body.updatedAt, type: 'dine_in', tableId: 1 })
      .expect(200);

    expect(res.body.type).toBe('dine_in');
    expect(res.body.deliveryPartnerId).toBeNull();
    expect(res.body.deliveryPartnerTitle).toBeNull();
    expect(res.body.deliveryExternalRef).toBeNull();
    expect(res.body.items[0].unitPriceHalalas).toBe(2300);
    expect(res.body.totalHalalas).toBe(2300);

    // type_changed payload unchanged (ADR 0004 contract)
    const types = res.body.events.filter((e: any) => e.type === 'type_changed');
    expect(types).toHaveLength(1);
    expect(JSON.parse(types[0].payload)).toEqual({
      fromType: 'takeaway',
      toType: 'dine_in',
      fromTableId: null,
      toTableId: 1,
    });

    const partnerEvts = res.body.events.filter((e: any) => e.type === 'delivery_partner_changed');
    expect(partnerEvts).toHaveLength(2); // set + dine_in clear
    expect(JSON.parse(partnerEvts[1].payload)).toMatchObject({
      fromPartnerId: 'hungerstation',
      toPartnerId: null,
      fromPartnerTitle: 'HungerStation',
      toPartnerTitle: null,
      fromExternalRef: 'HS-9',
      toExternalRef: null,
      resetItemCount: 1,
    });

    const resets = res.body.events.filter((e: any) => e.type === 'item_price_reset');
    expect(resets).toHaveLength(1);
    expect(JSON.parse(resets[0].payload)).toMatchObject({
      itemId: 1,
      fromUnitPriceHalalas: 2500,
      toUnitPriceHalalas: 2300,
      reason: 'type_changed_to_dine_in',
    });
  });

  it('takeaway → dine_in without a partner still resets prices (no partner event)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const _synced = await addItem(id, before.updatedAt, 1, 2);
    setLinePrice(id, 2500);

    const overridden = await getOrder(id);
    const res = await request(app.getHttpServer())
      .patch(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: overridden.updatedAt, type: 'dine_in', tableId: 1 })
      .expect(200);

    expect(res.body.type).toBe('dine_in');
    expect(res.body.items[0].unitPriceHalalas).toBe(2300);
    expect(res.body.totalHalalas).toBe(4600);
    expect(res.body.events.filter((e: any) => e.type === 'delivery_partner_changed')).toHaveLength(
      0,
    );
    const resets = res.body.events.filter((e: any) => e.type === 'item_price_reset');
    expect(resets).toHaveLength(1);
    expect(JSON.parse(resets[0].payload)).toMatchObject({ reason: 'type_changed_to_dine_in' });
  });

  it('dine_in → takeaway: no partner auto-set, prices unchanged', async () => {
    const { id } = await createOrder({ type: 'dine_in', tableId: 1 });
    const before = await getOrder(id);
    const _synced = await addItem(id, before.updatedAt, 1, 1);
    setLinePrice(id, 2500);

    const overridden = await getOrder(id);
    const res = await request(app.getHttpServer())
      .patch(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: overridden.updatedAt, type: 'takeaway' })
      .expect(200);

    expect(res.body.type).toBe('takeaway');
    expect(res.body.deliveryPartnerId).toBeNull();
    expect(res.body.deliveryExternalRef).toBeNull();
    expect(res.body.items[0].unitPriceHalalas).toBe(2500); // untouched
    expect(res.body.events.filter((e: any) => e.type === 'delivery_partner_changed')).toHaveLength(
      0,
    );
    expect(res.body.events.filter((e: any) => e.type === 'item_price_reset')).toHaveLength(0);
  });

  it('missing order → 404', async () => {
    await patchPartner(999999, {
      baseUpdatedAt: 0,
      deliveryPartnerId: 'hungerstation',
    }).expect(404);
  });
});

describe('listOrders — GET /orders returns newest first (DESC by orders.id)', () => {
  const createdIds: number[] = [];

  afterEach(async () => {
    // Void any open orders created during this test to keep the DB clean
    for (const id of createdIds) {
      try {
        await request(app.getHttpServer())
          .post(`/orders/${id}/void`)
          .set('Authorization', `Bearer ${jwtToken}`);
      } catch {
        // Order may already be paid/voided — ignore
      }
    }
    createdIds.length = 0;
  });

  async function createOrder(body: Record<string, unknown>): Promise<any> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body)
      .expect(201);
    createdIds.push(res.body.id);
    return res.body;
  }

  it('returns orders strictly descending by id (newest first)', async () => {
    const first = await createOrder({ type: 'takeaway' });
    const second = await createOrder({ type: 'takeaway' });
    const third = await createOrder({ type: 'takeaway' });

    // Sanity: ids are distinct and increasing as created
    expect(second.id).toBeGreaterThan(first.id);
    expect(third.id).toBeGreaterThan(second.id);

    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const ids: number[] = res.body.map((o: any) => o.id);

    // The three orders just created sit on top, newest id first
    expect(ids[0]).toBe(third.id);
    expect(ids[1]).toBe(second.id);
    expect(ids[2]).toBe(first.id);

    // Whole list is strictly descending
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i - 1]).toBeGreaterThan(ids[i]);
    }
  });

  it('status filter still returns newest-first', async () => {
    const a = await createOrder({ type: 'takeaway' });
    const b = await createOrder({ type: 'takeaway' });

    const res = await request(app.getHttpServer())
      .get('/orders?status=open')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const openIds: number[] = res.body.map((o: any) => o.id);

    expect(openIds[0]).toBe(b.id);
    expect(openIds[1]).toBe(a.id);
  });
});

describe('Delivery partner payment restriction — POST /orders/:id/payments (ADR 0007)', () => {
  // Partner catalog + their owned payment methods (1:1, shared slug
  // namespace). OR IGNORE: the partner PATCH describe above seeds the partner
  // rows already; the owned methods do not exist there.
  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT OR IGNORE INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('hungerstation', 'HungerStation', 1, 0, ${now}, ${now});
      INSERT OR IGNORE INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('keeta', 'Keeta', 1, 1, ${now}, ${now});
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('hungerstation', 'HungerStation', 1, 3, '30', ${now}, ${now});
      INSERT OR IGNORE INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('keeta', 'Keeta', 1, 4, '30', ${now}, ${now});
    `);
  });

  let orderIds: number[];

  beforeEach(() => {
    orderIds = [];
  });

  afterEach(async () => {
    // Void any open orders created during this test to keep the DB clean
    for (const id of orderIds) {
      try {
        await request(app.getHttpServer())
          .post(`/orders/${id}/void`)
          .set('Authorization', `Bearer ${jwtToken}`);
      } catch {
        // Order may already be paid/voided — ignore
      }
    }
  });

  // Open takeaway order with 2× Zinger Burger (total 4600 halalas).
  async function createOpenOrderWithItems(): Promise<{ orderId: number; totalHalalas: number }> {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;
    orderIds.push(orderId);

    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: getRes.body.updatedAt, items: [{ itemId: 1, qty: 2 }] })
      .expect(200);

    const fetched = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    return { orderId, totalHalalas: fetched.body.totalHalalas };
  }

  // Link the order to HungerStation via PATCH /orders/:id/partner.
  async function setPartner(orderId: number): Promise<void> {
    const before = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/partner`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: before.body.updatedAt, deliveryPartnerId: 'hungerstation' })
      .expect(200);
  }

  it('partner order + own method → 201, non-cash line appended (no tendered/change)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();
    await setPartner(orderId);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'hungerstation', amountHalalas: totalHalalas })
      .expect(201);

    expect(res.body.status).toBe('open');
    expect(res.body.payments).toHaveLength(1);
    const p = res.body.payments[0];
    expect(p.methodId).toBe('hungerstation');
    expect(p.methodTitle).toBe('HungerStation');
    // Credit / On Account — non-cash semantics (ADR 0007)
    expect(p.zatcaPaymentMeansCode).toBe('30');
    expect(p.tenderedHalalas).toBeNull();
    expect(p.changeHalalas).toBeNull();
  });

  it('partner order + cash → 400 with partner guidance', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();
    await setPartner(orderId);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas })
      .expect(400);

    expect(res.body.message).toContain('delivery partner');
    expect(res.body.message).toContain('hungerstation');
    expect(res.body.message).toContain('cash');
  });

  it('partner order + card → 400 with partner guidance', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();
    await setPartner(orderId);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'card', amountHalalas: totalHalalas })
      .expect(400);

    expect(res.body.message).toContain('delivery partner');
    expect(res.body.message).toContain('hungerstation');
  });

  it('partner order + a DIFFERENT partner method (keeta) → 400', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();
    await setPartner(orderId);

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'keeta', amountHalalas: totalHalalas })
      .expect(400);

    expect(res.body.message).toContain('delivery partner');
    expect(res.body.message).toContain('hungerstation');
    expect(res.body.message).toContain('keeta');
  });

  it('walk-in order (no partner) + partner-owned method → 400', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'hungerstation', amountHalalas: totalHalalas })
      .expect(400);

    expect(res.body.message).toContain('delivery partner');
    expect(res.body.message).toContain('hungerstation');
  });

  it('walk-in order (no partner) + cash → 201 (unchanged behavior)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();

    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: totalHalalas })
      .expect(201);

    expect(res.body.payments[0].methodId).toBe('cash');
    expect(res.body.status).toBe('open');
  });

  it('partner order pays fully on own method and submits → paid (normal flow intact)', async () => {
    const { orderId, totalHalalas } = await createOpenOrderWithItems();
    await setPartner(orderId);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'hungerstation', amountHalalas: totalHalalas })
      .expect(201);

    const submitRes = await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    expect(submitRes.body.status).toBe('paid');
    expect(submitRes.body.invoiceType).toBe('simplified');
  });
});

describe('Unit price override — PATCH /orders/:id/items/:orderItemId/unit-price (ADR 0007, Phase 7)', () => {
  let priceOrderIds: number[];

  beforeEach(() => {
    priceOrderIds = [];
  });

  afterEach(async () => {
    // Void any open orders created during this test to keep the DB clean
    for (const id of priceOrderIds) {
      try {
        await request(app.getHttpServer())
          .post(`/orders/${id}/void`)
          .set('Authorization', `Bearer ${jwtToken}`);
      } catch {
        // Order may already be paid/voided — ignore
      }
    }
  });

  async function createOrder(body: Record<string, unknown>): Promise<any> {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body)
      .expect(201);
    priceOrderIds.push(res.body.id);
    return res.body;
  }

  async function getOrder(id: number): Promise<any> {
    const res = await request(app.getHttpServer())
      .get(`/orders/${id}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    return res.body;
  }

  async function addItem(orderId: number, updatedAt: number, itemId = 1, qty = 1): Promise<any> {
    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: updatedAt, items: [{ itemId, qty }] })
      .expect(200);
    return res.body;
  }

  function patchUnitPrice(orderId: number, orderItemId: number, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/orders/${orderId}/items/${orderItemId}/unit-price`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(body);
  }

  /** Open takeaway order with one item (item 1 @ 2300) and a partner set. */
  async function createPartnerOrderWithLine(): Promise<{
    orderId: number;
    orderItemId: number;
    updatedAt: number;
    order: any;
  }> {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 2); // qty 2 → line total 4600
    const set = await request(app.getHttpServer())
      .patch(`/orders/${id}/partner`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: synced.updatedAt,
        deliveryPartnerId: 'hungerstation',
        deliveryExternalRef: 'HS-P7',
      })
      .expect(200);
    return {
      orderId: id,
      orderItemId: set.body.items[0].id,
      updatedAt: set.body.updatedAt,
      order: set.body,
    };
  }

  it('override success: line + order totals recomputed, event payload exact, full order returned', async () => {
    const { orderId, orderItemId, updatedAt } = await createPartnerOrderWithLine();

    const res = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2500,
    }).expect(200);

    // Line total = unit price × qty; order totals recomputed via the VAT path
    expect(res.body.items[0].unitPriceHalalas).toBe(2500);
    expect(res.body.items[0].totalHalalas).toBe(5000);
    expect(res.body.totalHalalas).toBe(5000);
    // VAT decomposition: decomposeVat(5000, 1500) → excl ≈ 4348, vat ≈ 652
    expect(res.body.subtotalHalalas).toBe(4348);
    expect(res.body.vatHalalas).toBe(652);

    // DB persisted
    const dbOrderItem: any = db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.id, orderItemId))
      .get();
    expect(dbOrderItem.unitPriceHalalas).toBe(2500);
    expect(dbOrderItem.totalHalalas).toBe(5000);

    // Event payload exact per ADR 0007
    const overrides = res.body.events.filter((e: any) => e.type === 'item_price_overridden');
    expect(overrides).toHaveLength(1);
    expect(JSON.parse(overrides[0].payload)).toEqual({
      orderItemId,
      itemId: 1,
      fromUnitPriceHalalas: 2300,
      toUnitPriceHalalas: 2500,
      floorPriceHalalas: 2300,
    });
  });

  it('override to the floor price itself succeeds', async () => {
    const { orderId, orderItemId, updatedAt } = await createPartnerOrderWithLine();

    const res = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2300, // floor
    }).expect(200);

    expect(res.body.items[0].unitPriceHalalas).toBe(2300);
    expect(res.body.items[0].totalHalalas).toBe(4600);
    // Same price → no-op, no event, no bump
    expect(res.body.events.filter((e: any) => e.type === 'item_price_overridden')).toHaveLength(0);
    expect(res.body.updatedAt).toBe(updatedAt);
  });

  it('identical price → 200 no-op: no event, no updated_at bump', async () => {
    const { orderId, orderItemId, updatedAt } = await createPartnerOrderWithLine();
    const eventCount = (await getOrder(orderId)).events.length;

    // First a real override so the line sits off-catalog…
    const first = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2500,
    }).expect(200);

    // …then send the same price again → no-op
    const res = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: first.body.updatedAt,
      unitPriceHalalas: 2500,
    }).expect(200);

    expect(res.body.items[0].unitPriceHalalas).toBe(2500);
    expect(res.body.updatedAt).toBe(first.body.updatedAt);
    expect(res.body.events.length).toBe(eventCount + 1); // only the first override event
  });

  it('below-floor price → 400 with the floor in the message', async () => {
    const { orderId, orderItemId, updatedAt } = await createPartnerOrderWithLine();

    const res = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2299,
    }).expect(400);
    expect(res.body.message).toBe(
      'Unit price must be at least the catalog price of 2300 halalas (floor)',
    );
  });

  it('floor is the LIVE catalog price read at edit time, even when the item is inactive', async () => {
    const { orderId, orderItemId, updatedAt } = await createPartnerOrderWithLine();

    // Catalog price raised after the line snapshot; item soft-disabled.
    sqlite.exec(`UPDATE items SET price_halalas = 2500, is_active = 0 WHERE id = 1`);

    // Old floor is no longer enough → 400 with the new floor
    const below = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2400,
    }).expect(400);
    expect(below.body.message).toBe(
      'Unit price must be at least the catalog price of 2500 halalas (floor)',
    );

    // At the new floor → ok, even though the item is inactive
    const res = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2500,
    }).expect(200);
    expect(res.body.items[0].unitPriceHalalas).toBe(2500);
    expect(JSON.parse(res.body.events.at(-1).payload)).toEqual({
      orderItemId,
      itemId: 1,
      fromUnitPriceHalalas: 2300,
      toUnitPriceHalalas: 2500,
      floorPriceHalalas: 2500,
    });

    // Restore catalog for later tests
    sqlite.exec(`UPDATE items SET price_halalas = 2300, is_active = 1 WHERE id = 1`);
  });

  it('order without a delivery partner → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);

    const res = await patchUnitPrice(id, synced.items[0].id, {
      baseUpdatedAt: synced.updatedAt,
      unitPriceHalalas: 2500,
    }).expect(400);
    expect(res.body.message).toBe('Line price overrides require a delivery partner on the order');
  });

  it('non-open (paid) order → 400', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);
    const set = await request(app.getHttpServer())
      .patch(`/orders/${id}/partner`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: synced.updatedAt, deliveryPartnerId: 'hungerstation' })
      .expect(200);

    // Partner order pays only on the partner's own method (ADR 0007)
    await request(app.getHttpServer())
      .post(`/orders/${id}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'hungerstation', amountHalalas: set.body.totalHalalas })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${id}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    const paid = await getOrder(id);
    const res = await patchUnitPrice(id, set.body.items[0].id, {
      baseUpdatedAt: paid.updatedAt,
      unitPriceHalalas: 2500,
    }).expect(400);
    expect(res.body.message).toBe('Only open orders can override line prices');
  });

  it('line with item_id NULL → 400 (cannot override)', async () => {
    const { id } = await createOrder({ type: 'takeaway' });
    const before = await getOrder(id);
    const synced = await addItem(id, before.updatedAt, 1, 1);
    const set = await request(app.getHttpServer())
      .patch(`/orders/${id}/partner`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: synced.updatedAt, deliveryPartnerId: 'hungerstation' })
      .expect(200);

    // Legacy/orphan line with no catalog link
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${id}, NULL, 'Legacy Special', 2000, 1500, 1, 2000, ${set.body.updatedAt}, ${set.body.updatedAt});
    `);
    const withLegacy = await getOrder(id);
    const legacy = withLegacy.items.find((i: any) => i.itemId === null);

    const res = await patchUnitPrice(id, legacy.id, {
      baseUpdatedAt: withLegacy.updatedAt,
      unitPriceHalalas: 2500,
    }).expect(400);
    expect(res.body.message).toBe(
      `Order item ${legacy.id} has no catalog item — cannot override its price`,
    );
  });

  it('line that does not belong to the order (or unknown line) → 404', async () => {
    const a = await createPartnerOrderWithLine();
    const b = await createPartnerOrderWithLine();

    // b's line id against a's order → 404
    const res = await patchUnitPrice(a.orderId, b.orderItemId, {
      baseUpdatedAt: a.updatedAt,
      unitPriceHalalas: 2500,
    }).expect(404);
    expect(res.body.message).toBe(`Order item ${b.orderItemId} not found on order ${a.orderId}`);

    // Unknown line id → 404
    await patchUnitPrice(a.orderId, 999999, {
      baseUpdatedAt: a.updatedAt,
      unitPriceHalalas: 2500,
    }).expect(404);
  });

  it('stale baseUpdatedAt → 409 with updatedAt', async () => {
    const { orderId, orderItemId, updatedAt } = await createPartnerOrderWithLine();

    // Wait >1s so the first override lands in a later second than the
    // create/sync/partner-set (updated_at is second-granularity) and
    // therefore actually bumps it.
    await new Promise((r) => setTimeout(r, 1500));
    const other = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt,
      unitPriceHalalas: 2500,
    }).expect(200);

    const res = await patchUnitPrice(orderId, orderItemId, {
      baseUpdatedAt: updatedAt, // stale — order was overridden since
      unitPriceHalalas: 2600,
    }).expect(409);
    expect(res.body.message).toBe(
      'Order was modified by another terminal. Please refresh your cart.',
    );
    expect(res.body.updatedAt).toBe(other.body.updatedAt);
  }, 10000);

  it('missing order → 404', async () => {
    await patchUnitPrice(999999, 1, { baseUpdatedAt: 0, unitPriceHalalas: 2500 }).expect(404);
  });
});

describe('syncItems (bulk cart sync)', () => {
  let zingerItemId: number;
  let pepsiItemId: number;

  beforeAll(() => {
    zingerItemId = 1;
    pepsiItemId = 2;
  });

  async function createOpenOrder(): Promise<{ orderId: number; updatedAt: number }> {
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

    return { orderId, updatedAt: getRes.body.updatedAt };
  }

  // --- Test 1: Add new lines ---
  it('adds new lines: items persisted, totals correct, item_added events', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    const syncRes = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [
          { itemId: zingerItemId, qty: 2 },
          { itemId: pepsiItemId, qty: 1 },
        ],
      })
      .expect(200);

    // Items persisted
    expect(syncRes.body.items).toHaveLength(2);

    // Totals correct (2×2300 + 1×575 = 5175)
    expect(syncRes.body.totalHalalas).toBe(5175);

    // Android/Moshi contract: isStandardInvoice must be a real JSON boolean,
    // never the SQLite integer 0/1
    expect(typeof syncRes.body.isStandardInvoice).toBe('boolean');
    expect(syncRes.body.isStandardInvoice).toBe(false);

    // OrderResponse shape: payments always present as an array (empty for open orders)
    expect(Array.isArray(syncRes.body.payments)).toBe(true);
    expect(syncRes.body.payments).toHaveLength(0);

    // item_added events
    const events = syncRes.body.events;
    const addEvents = events.filter((e: any) => e.type === 'item_added');
    expect(addEvents).toHaveLength(2);

    // ADR 0006: item_added records kitchenPrintedQty 0 and sync never
    // kitchen-prints (no kitchen_print_enqueued events)
    for (const evt of addEvents) {
      const p = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;
      expect(p.kitchenPrintedQty).toBe(0);
    }
    expect(events.filter((e: any) => e.type === 'kitchen_print_enqueued').length).toBe(0);
  });

  // --- Test 2: Update qty up → item_updated, kitchenPrintedQty 0, NO print (ADR 0006) ---
  it('increases qty: item_updated event with kitchenPrintedQty 0, no kitchen print', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // First sync: add 2 burgers
    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    await new Promise((r) => setTimeout(r, 200));
    transport.sent = [];

    // Second sync: increase to 5 — must NOT print anything
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 5 }],
      })
      .expect(200);

    // item_updated event exists
    const events = res2.body.events;
    const updateEvents = events.filter((e: any) => e.type === 'item_updated');
    expect(updateEvents.length).toBeGreaterThanOrEqual(1);

    // ADR 0006: item mutations always record kitchenPrintedQty 0
    const updatePayload =
      typeof updateEvents[updateEvents.length - 1].payload === 'string'
        ? JSON.parse(updateEvents[updateEvents.length - 1].payload)
        : updateEvents[updateEvents.length - 1].payload;
    expect(updatePayload.kitchenPrintedQty).toBe(0);
    expect(updatePayload.newQty).toBe(5);

    // No kitchen_print_enqueued events from sync
    expect(events.filter((e: any) => e.type === 'kitchen_print_enqueued').length).toBe(0);

    await new Promise((r) => setTimeout(r, 200));

    // No kitchen print should have been sent
    const kitchenPrints = transport.sent.filter(
      (s: any) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
    );
    expect(kitchenPrints.length).toBe(0);
  });

  // --- Test 3: Qty down → saved; kitchenPrintedQty 0; no print ---
  it('decreases qty: saved, no kitchen print when qty goes down', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 3 }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    await new Promise((r) => setTimeout(r, 200));
    transport.sent = [];

    // Decrease qty to 1
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 1 }],
      })
      .expect(200);

    expect(res2.body.items[0].qty).toBe(1);

    await new Promise((r) => setTimeout(r, 100));

    // No kitchen prints for qty decrease
    const kitchenPrints = transport.sent.filter(
      (s: any) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
    );
    expect(kitchenPrints.length).toBe(0);
  });

  // --- Test 4: Notes only → saved; no kitchen print ---
  it('notes-only change: saved, no kitchen print enqueued', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1 }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    await new Promise((r) => setTimeout(r, 200));
    transport.sent = [];

    // Notes-only update (same qty)
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 1, notes: 'no onions' }],
      })
      .expect(200);

    expect(res2.body.items[0].notes).toBe('no onions');

    // ADR 0006: sync never writes kitchen_print_enqueued events
    const events = res2.body.events;
    const kitchenEnqEvents = events.filter((e: any) => e.type === 'kitchen_print_enqueued');
    expect(kitchenEnqEvents.length).toBe(0);
    const updateEvents = events.filter((e: any) => e.type === 'item_updated');
    expect(updateEvents.length).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 100));
    const kitchenPrints = transport.sent.filter((s: any) => s.ip !== '192.168.1.50');
    expect(kitchenPrints.length).toBe(0);
  });

  // --- Test 5: Remove all (empty cart) → zero items; no kitchen print ---
  it('empty cart sync: zero items, no kitchen print enqueued', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // Add items first
    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(200);

    const updatedAt2 = res1.body.updatedAt;
    await new Promise((r) => setTimeout(r, 200));
    transport.sent = [];

    // Empty sync
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [],
      })
      .expect(200);

    expect(res2.body.items).toHaveLength(0);
    expect(res2.body.totalHalalas).toBe(0);

    await new Promise((r) => setTimeout(r, 100));

    // No kitchen prints
    const kitchenPrints = transport.sent.filter((s: any) => s.ip !== '192.168.1.50');
    expect(kitchenPrints.length).toBe(0);
  });

  // --- Test 6: Stale baseUpdatedAt → 409 ---
  it('stale baseUpdatedAt returns 409 Conflict', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // Wait to ensure a different timestamp for the first sync
    await new Promise((r) => setTimeout(r, 1500));

    // First sync — succeeds because baseUpdatedAt matches the order's current updatedAt
    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1 }],
      })
      .expect(200);

    // Second sync with the SAME stale baseUpdatedAt — must fail
    // because the first sync already updated the order's updatedAt
    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt, // stale! Order was modified by first sync
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(409);

    expect(res.body.message).toContain('modified by another terminal');
  }, 10000);

  // --- Test 7: Not open order → 400 ---
  it('syncItems on paid order returns 400', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // Add items
    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1 }],
      })
      .expect(200);

    // Finalize via payments + submit
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ methodId: 'cash', amountHalalas: res.body.totalHalalas })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({})
      .expect(201);

    const newUpdatedAt = res.body.updatedAt;

    // Try sync on paid order
    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: newUpdatedAt,
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(400);
  });

  // --- Test 8: Unknown menu itemId → 404 ---
  it('unknown menu itemId returns 404', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: 999, qty: 1 }],
      })
      .expect(404);
  });

  // --- Test 9: orderItemId not on order → 404 ---
  it('orderItemId not belonging to order returns 404', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ orderItemId: 9999, qty: 1 }],
      })
      .expect(404);
  });

  // --- Test 10: Invalid qty (<1) → 400 ---
  it('invalid qty (<1) returns 400', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 0 }],
      })
      .expect(400);
  });

  // --- Test 11: Multi-item sync → items persist, NO kitchen print (ADR 0006) ---
  it('multi-item single sync: items persisted, no kitchen print enqueued', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // Use items 1 (Zinger, cat 1 → Kitchen printer 2) and 2 (Pepsi, cat 1 → same printer).
    transport.sent = [];

    const syncRes = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [
          { itemId: 1, qty: 2 },
          { itemId: 2, qty: 1 },
        ],
      })
      .expect(200);

    expect(syncRes.body.items).toHaveLength(2);

    await new Promise((r) => setTimeout(r, 300));

    // ADR 0006: no kitchen prints from sync
    const kitchenPrints = transport.sent.filter((s: any) => s.ip !== '192.168.1.50');
    expect(kitchenPrints.length).toBe(0);

    // No kitchen_print_enqueued events from sync
    const events = syncRes.body.events;
    const enqEvents = events.filter((e: any) => e.type === 'kitchen_print_enqueued');
    expect(enqEvents.length).toBe(0);

    // item_added events still carry kitchenPrintedQty 0
    const addEvents = events.filter((e: any) => e.type === 'item_added');
    expect(addEvents).toHaveLength(2);
    for (const evt of addEvents) {
      const p = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;
      expect(p.kitchenPrintedQty).toBe(0);
    }
  });

  // --- Test 12: Unchanged lines do not emit item_updated ---
  it('unchanged lines do not emit item_updated, only truly changed lines do', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // First sync: add item A (Zinger qty 2) and item B (Pepsi qty 1)
    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [
          { itemId: zingerItemId, qty: 2 },
          { itemId: pepsiItemId, qty: 1 },
        ],
      })
      .expect(200);

    const zingerOiId = res1.body.items.find((i: any) => i.itemId === zingerItemId).id;
    const pepsiOiId = res1.body.items.find((i: any) => i.itemId === pepsiItemId).id;
    const updatedAt2 = res1.body.updatedAt;

    // Second sync: Zinger unchanged (qty 2, no notes), Pepsi qty increased (1→2)
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [
          { orderItemId: zingerOiId, qty: 2 }, // unchanged
          { orderItemId: pepsiOiId, qty: 2 }, // changed: 1→2
        ],
      })
      .expect(200);

    const events = res2.body.events;
    const updateEvents = events.filter((e: any) => e.type === 'item_updated');

    // Exactly 1 item_updated event (Pepsi only; Zinger was no-op)
    expect(updateEvents.length).toBe(1);

    // The single item_updated must be for Pepsi with oldQty !== newQty
    const pepsiUpdatePayload =
      typeof updateEvents[0].payload === 'string'
        ? JSON.parse(updateEvents[0].payload)
        : updateEvents[0].payload;
    expect(pepsiUpdatePayload.oldQty).toBe(1);
    expect(pepsiUpdatePayload.newQty).toBe(2);

    // Ensure no item_updated has oldQty === newQty (would indicate no-op line leaked)
    for (const evt of updateEvents) {
      const p = typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload;
      expect(p.oldQty).not.toBe(p.newQty);
    }
  });

  // --- Test 13: Identical cart snapshot is a no-op ---
  it('identical cart snapshot does not bump updatedAt or create new events', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // First sync: add Zinger qty 2
    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    // Second sync: exact same snapshot
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 2 }],
      })
      .expect(200);

    // updatedAt must NOT have changed (no pointless order row update)
    expect(res2.body.updatedAt).toBe(updatedAt2);

    // No new item_updated events for unchanged lines
    const updateEvents = res2.body.events.filter((e: any) => e.type === 'item_updated');
    expect(updateEvents.length).toBe(0);
  });

  // --- Test 14: notes-only change still emits item_updated but no kitchen delta ---
  it('notes-only change emits item_updated but no kitchen print', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 2, notes: 'spicy' }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    await new Promise((r) => setTimeout(r, 200));
    transport.sent = [];

    // Same qty, different notes
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 2, notes: 'extra spicy' }],
      })
      .expect(200);

    // item_updated event must exist for notes change
    const updateEvents = res2.body.events.filter((e: any) => e.type === 'item_updated');
    expect(updateEvents.length).toBe(1);

    // The payload should include notes
    const payload =
      typeof updateEvents[0].payload === 'string'
        ? JSON.parse(updateEvents[0].payload)
        : updateEvents[0].payload;
    expect(payload.notes).toBe('extra spicy');
    // oldQty === newQty (only notes changed)
    expect(payload.oldQty).toBe(2);
    expect(payload.newQty).toBe(2);
    // No kitchen delta for notes-only
    expect(payload.kitchenPrintedQty).toBe(0);

    // No kitchen print happened
    await new Promise((r) => setTimeout(r, 100));
    const kitchenPrints = transport.sent.filter((s: any) => s.ip !== '192.168.1.50');
    expect(kitchenPrints.length).toBe(0);
  });

  // --- Test 15: notes cleared to blank normalizes to null ---
  it('clearing notes via null or empty string normalizes to null', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    // First sync with notes
    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1, notes: 'no onions' }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    expect(res1.body.items[0].notes).toBe('no onions');
    const updatedAt2 = res1.body.updatedAt;

    // Clear notes to empty string
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 1, notes: '' }],
      })
      .expect(200);

    // Empty string → normalized to null in DB
    expect(res2.body.items[0].notes).toBeNull();

    // item_updated event emitted with notes: null
    const updateEvents = res2.body.events.filter((e: any) => e.type === 'item_updated');
    expect(updateEvents.length).toBe(1);
  });

  // --- Test 16: setting notes to same value is a no-op ---
  it('setting notes to the same value is a no-op', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1, notes: 'no onions' }],
      })
      .expect(200);

    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    // Same notes, same qty — should be fully no-op
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 1, notes: 'no onions' }],
      })
      .expect(200);

    // updatedAt unchanged
    expect(res2.body.updatedAt).toBe(updatedAt2);

    // No item_updated events
    const updateEvents = res2.body.events.filter((e: any) => e.type === 'item_updated');
    expect(updateEvents.length).toBe(0);
  });

  // --- ADR 0005: Android qty floor + clientType enforcement ---

  async function createOpenOrderWithToken(token: string): Promise<{
    orderId: number;
    updatedAt: number;
  }> {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;

    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return { orderId, updatedAt: getRes.body.updatedAt };
  }

  it('android sync that decreases qty below server qty returns 400 and leaves order unchanged', async () => {
    // waiter is seeded with android_login=1 (tablet floor user)
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const { orderId, updatedAt } = await createOpenOrderWithToken(androidToken);

    // POS adds 3 zingers
    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 3 }],
      })
      .expect(200);
    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    // Android tries to decrease to 1 — must be rejected entirely
    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 1 }],
      })
      .expect(400);

    expect(res.body.message).toBe('Kitchen items can only be reduced at the cashier.');

    // Order unchanged
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.items[0].qty).toBe(3);
  });

  it('android sync that omits a server line (remove) returns 400 and leaves order unchanged', async () => {
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const { orderId, updatedAt } = await createOpenOrderWithToken(androidToken);

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1 }],
      })
      .expect(200);
    const updatedAt2 = res1.body.updatedAt;

    // Android sends an empty cart — the existing line is missing → remove
    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [],
      })
      .expect(400);

    expect(res.body.message).toBe('Kitchen items can only be reduced at the cashier.');

    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.items[0].qty).toBe(1);
  });

  it('android sync that increases qty, adds new lines, or edits notes returns 200', async () => {
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const { orderId, updatedAt } = await createOpenOrderWithToken(androidToken);

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 1 }],
      })
      .expect(200);
    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    // Android: increase qty 1→2, add a new Pepsi line, and change notes
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [
          { orderItemId: itemId, qty: 2, notes: 'no onions' },
          { itemId: pepsiItemId, qty: 1 },
        ],
      })
      .expect(200);

    expect(res2.body.items).toHaveLength(2);
    const zinger = res2.body.items.find((i: any) => i.itemId === zingerItemId);
    expect(zinger.qty).toBe(2);
    expect(zinger.notes).toBe('no onions');
    const pepsi = res2.body.items.find((i: any) => i.itemId === pepsiItemId);
    expect(pepsi.qty).toBe(1);
  });

  it('android sync with qty equal to server qty (no-op or notes-only) returns 200', async () => {
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const { orderId, updatedAt } = await createOpenOrderWithToken(androidToken);

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(200);
    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    // Same qty, notes change — allowed (qty equals the floor)
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: itemId, qty: 2, notes: 'extra spicy' }],
      })
      .expect(200);

    expect(res2.body.items[0].qty).toBe(2);
    expect(res2.body.items[0].notes).toBe('extra spicy');
  });

  it('mixed android payload with one illegal decrease rejects the entire sync (no partial apply)', async () => {
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const { orderId, updatedAt } = await createOpenOrderWithToken(androidToken);

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [{ itemId: zingerItemId, qty: 3 }],
      })
      .expect(200);
    const itemId = res1.body.items[0].id;
    const updatedAt2 = res1.body.updatedAt;

    // Decrease (illegal) + add a new line (valid) — the whole sync must fail
    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [
          { orderItemId: itemId, qty: 1 },
          { itemId: pepsiItemId, qty: 2 },
        ],
      })
      .expect(400);

    // Nothing applied: still 1 line, qty 3, no Pepsi
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(getRes.body.items).toHaveLength(1);
    expect(getRes.body.items[0].qty).toBe(3);
  });

  it('pos sync that decreases or removes lines still works (regression)', async () => {
    const { orderId, updatedAt } = await createOpenOrder();

    const res1 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt,
        items: [
          { itemId: zingerItemId, qty: 3 },
          { itemId: pepsiItemId, qty: 1 },
        ],
      })
      .expect(200);
    const zingerId = res1.body.items.find((i: any) => i.itemId === zingerItemId).id;
    const updatedAt2 = res1.body.updatedAt;

    // POS decreases zinger 3→1 and removes pepsi entirely
    const res2 = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: updatedAt2,
        items: [{ orderItemId: zingerId, qty: 1 }],
      })
      .expect(200);

    expect(res2.body.items).toHaveLength(1);
    expect(res2.body.items[0].qty).toBe(1);
  });
});

describe('sendToKitchen (explicit kitchen print, ADR 0006)', () => {
  const zingerItemId = 1;

  async function createOpenOrder(): Promise<{ orderId: number; updatedAt: number }> {
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

    return { orderId, updatedAt: getRes.body.updatedAt };
  }

  async function syncItems(orderId: number, updatedAt: number, items: any[]) {
    return request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: updatedAt, items })
      .expect(200);
  }

  async function sendToKitchen(orderId: number) {
    return request(app.getHttpServer())
      .post(`/orders/${orderId}/send-to-kitchen`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
  }

  function enqueuedPayloads(order: any): any[] {
    return order.events
      .filter((e: any) => e.type === 'kitchen_print_enqueued')
      .map((e: any) => (typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload));
  }

  it('first send prints full unsent qty; second send is a 200 no-op with no new events', async () => {
    const { orderId, updatedAt } = await createOpenOrder();
    const syncRes = await syncItems(orderId, updatedAt, [{ itemId: zingerItemId, qty: 5 }]);
    const orderItemId = syncRes.body.items[0].id;
    const updatedAtAfterSync = syncRes.body.updatedAt;

    transport.sent = [];

    // First send: delta = 5 (nothing printed yet)
    const res1 = await sendToKitchen(orderId);

    const enq1 = enqueuedPayloads(res1.body);
    expect(enq1).toHaveLength(1);
    // TEMPORARY fan-out payload: items hold the ledger claim (counted once),
    // printers[] lists the targets, printer is the timeline label. This test
    // DB seeds a single kitchen printer: id 2 named 'Kitchen'.
    expect(enq1[0].items).toEqual([{ orderItemId, itemName: 'Zinger Burger', printedQty: 5 }]);
    expect(enq1[0].printers).toEqual([{ printerId: 2, printer: 'Kitchen' }]);
    expect(enq1[0].printer).toBe('Kitchen');

    // updatedAt bumped so the POS can detect the send
    expect(res1.body.updatedAt).toBeGreaterThanOrEqual(updatedAtAfterSync);

    // Kitchen ticket actually printed (non-blocking)
    await new Promise((r) => setTimeout(r, 200));
    const kitchenPrints = transport.sent.filter(
      (s: any) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
    );
    expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
    expect(kitchenPrints[0].data.toString('ascii')).toContain('5 Zinger Burger');

    // Second send with no changes → 200 no-op, no new enqueued events
    const res2 = await sendToKitchen(orderId);
    expect(enqueuedPayloads(res2.body)).toHaveLength(1);
    // updatedAt unchanged by the no-op
    expect(res2.body.updatedAt).toBe(res1.body.updatedAt);
    expect(res2.body.items).toHaveLength(1);
    expect(res2.body.items[0].qty).toBe(5);
  });

  it('sends only the unsent delta after a qty increase via sync', async () => {
    const { orderId, updatedAt } = await createOpenOrder();
    const sync1 = await syncItems(orderId, updatedAt, [{ itemId: zingerItemId, qty: 5 }]);
    const orderItemId = sync1.body.items[0].id;

    // First send: 5 printed
    await sendToKitchen(orderId);

    // Qty up to 8 via sync — sync itself never prints (ADR 0006)
    const sync2 = await syncItems(orderId, sync1.body.updatedAt, [{ orderItemId, qty: 8 }]);
    expect(sync2.body.items[0].qty).toBe(8);
    expect(enqueuedPayloads(sync2.body)).toHaveLength(1); // still only the first send

    transport.sent = [];

    // Second send: only delta 3 (8 − 5 printed)
    const res2 = await sendToKitchen(orderId);
    const enq = enqueuedPayloads(res2.body);
    expect(enq).toHaveLength(2);
    expect(enq[enq.length - 1].items).toEqual([
      { orderItemId, itemName: 'Zinger Burger', printedQty: 3 },
    ]);

    await new Promise((r) => setTimeout(r, 200));
    const kitchenPrints = transport.sent.filter(
      (s: any) => s.ip !== '192.168.1.50' && s.data.toString('ascii').includes('Zinger Burger'),
    );
    expect(kitchenPrints.length).toBeGreaterThanOrEqual(1);
    expect(kitchenPrints[0].data.toString('ascii')).toContain('3 Zinger Burger');
  });

  it('qty decrease: send does not print negative; printed total stays high', async () => {
    const { orderId, updatedAt } = await createOpenOrder();
    const sync1 = await syncItems(orderId, updatedAt, [{ itemId: zingerItemId, qty: 5 }]);
    const orderItemId = sync1.body.items[0].id;

    // Send 5
    await sendToKitchen(orderId);

    // Qty down to 2 via sync (no print)
    const sync2 = await syncItems(orderId, sync1.body.updatedAt, [{ orderItemId, qty: 2 }]);
    expect(sync2.body.items[0].qty).toBe(2);

    transport.sent = [];

    // Send: no deltas (printed 5 ≥ qty 2) → no new events, no prints
    const res2 = await sendToKitchen(orderId);
    expect(enqueuedPayloads(res2.body)).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 200));
    expect(transport.sent.filter((s: any) => s.ip !== '192.168.1.50').length).toBe(0);
  });

  it('send-to-kitchen on a non-open order returns 400', async () => {
    const { orderId, updatedAt } = await createOpenOrder();
    await syncItems(orderId, updatedAt, [{ itemId: zingerItemId, qty: 1 }]);

    // Finalize via payments + submit (1 Zinger = 2300 halalas)
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

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/send-to-kitchen`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(400);
  });

  it('send-to-kitchen on a missing order returns 404', async () => {
    await request(app.getHttpServer())
      .post('/orders/999999/send-to-kitchen')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(404);
  });

  it('send-to-kitchen is gated by update_order (same permission as syncItems, ADR 0006)', async () => {
    // waiter is seeded with android_login=1 and holds update_order (it can
    // call syncItems). ADR 0006 introduces no new permission — send-to-kitchen
    // reuses update_order; the Android app just has no UI button for it.
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const { orderId, updatedAt } = await createOpenOrder();
    await syncItems(orderId, updatedAt, [{ itemId: zingerItemId, qty: 1 }]);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/send-to-kitchen`)
      .set('Authorization', `Bearer ${androidToken}`)
      .expect(200);
  });

  it('android syncItems still works and never kitchen-prints (regression)', async () => {
    const androidLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'waiter', pin: '2', clientType: 'android' })
      .expect(201);
    const androidToken = androidLogin.body.accessToken;

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${androidToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    const orderId = orderRes.body.id;

    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${androidToken}`)
      .expect(200);

    transport.sent = [];

    const res = await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${androidToken}`)
      .send({
        baseUpdatedAt: getRes.body.updatedAt,
        items: [{ itemId: zingerItemId, qty: 2 }],
      })
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].qty).toBe(2);

    // No kitchen_print_enqueued events, item_added carries kitchenPrintedQty 0
    expect(res.body.events.filter((e: any) => e.type === 'kitchen_print_enqueued').length).toBe(0);
    const addedEvent = res.body.events.find((e: any) => e.type === 'item_added');
    const addedPayload =
      typeof addedEvent.payload === 'string' ? JSON.parse(addedEvent.payload) : addedEvent.payload;
    expect(addedPayload.kitchenPrintedQty).toBe(0);

    // No kitchen prints at all
    await new Promise((r) => setTimeout(r, 200));
    expect(transport.sent.filter((s: any) => s.ip !== '192.168.1.50').length).toBe(0);
  });
});
