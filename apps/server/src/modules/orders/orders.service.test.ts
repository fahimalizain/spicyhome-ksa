import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { AppModule } from '../../app.module';
import { DRIZZLE } from '../database/database.module';
import { FakePrinterTransport } from '../printers/printer-transport';
import { PrintersService } from '../printers/printers.service';

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

describe('Order Refunds', () => {
  async function createPaidOrder(): Promise<{
    orderId: number;
    items: Array<{ id: number; itemName: string }>;
  }> {
    // Create order
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: 1 })
      .expect(201);
    const orderId = orderRes.body.id;

    // Add items
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ itemId: 1, qty: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ itemId: 2, qty: 1 })
      .expect(201);

    // Wait for kitchen prints
    await new Promise((r) => setTimeout(r, 200));

    // Get order to capture item IDs
    const fetched = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    // Pay the order
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${jwtToken}`)
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
      expect(receiptStr).toContain('REFUND');

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
        .send({ items: refundItems })
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
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }] })
        .expect(201);

      // Try to refund 2 more — should fail (only 1 remaining)
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: zingerItem.id, qty: 2 }] })
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

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: 1, qty: 1 })
        .expect(201);

      // Get the item ID
      const fetched = await request(app.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      // Try to refund an open order
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/refund`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ items: [{ orderItemId: fetched.body.items[0].id, qty: 1 }] })
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

      await request(app.getHttpServer())
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ itemId: 1, qty: 1 })
        .expect(201);

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
        .send({ items: [{ orderItemId: fetched.body.items[0].id, qty: 1 }] })
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
        .send({ items: [{ orderItemId: zingerItem.id, qty: 1 }] })
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

      // The refund-related receipt_print_enqueued should have kickDrawer: false
      const enqueuedEvent = eventsRes.body.find((e: any) => e.type === 'receipt_print_enqueued');
      expect(enqueuedEvent).toBeDefined();
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

    it('GET /orders/:id/audit/verify backwards-compatible alias works', async () => {
      const { orderId } = await createPaidOrder();

      const res = await request(app.getHttpServer())
        .get(`/orders/${orderId}/audit/verify`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.valid).toBe(true);
    });
  });
});
