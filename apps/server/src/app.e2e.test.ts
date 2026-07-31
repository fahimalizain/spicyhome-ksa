import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { AppModule } from './app.module';
import { DRIZZLE } from './modules/database/database.module';
let app: INestApplication;
let sqlite: any;
let db: any;
let jwtToken: string;

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

  const now = Math.floor(Date.now() / 1000);

  // Replace seeded data with test-specific data
  sqlite.exec(`
    DELETE FROM items;
    DELETE FROM item_categories;
    DELETE FROM tables;

    INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'T1', 0, 1, ${now}, ${now});

    INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'Burgers', 0, 1, ${now}, ${now});

    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (1, 1, 'Zinger Burger', 2300, 1500, 0, 1, ${now}, ${now});
  `);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username: 'admin', pin: '771133' });
  jwtToken = loginRes.body.accessToken;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe('Auth (e2e)', () => {
  it('POST /auth/login works', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', pin: '771133' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /auth/login wrong PIN returns 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', pin: '0000' })
      .expect(401);
  });

  it('GET /auth/roles with admin token returns roles', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/roles')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /auth/me returns current user with role permissions', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.username).toBe('admin');
    expect(res.body.name).toBe('Administrator');
    expect(res.body.roleName).toBe('admin');
    expect(res.body.manageMenu).toBe(true);
    expect(res.body.manageUsers).toBe(true);
  });

  it('GET /auth/usernames without auth returns active usernames', async () => {
    const res = await request(app.getHttpServer()).get('/auth/usernames').expect(200);
    expect(res.body.usernames).toBeDefined();
    expect(Array.isArray(res.body.usernames)).toBe(true);
    expect(res.body.usernames).toContain('admin');
    // Seeded cashier (staff, android_login=1) is included without a platform filter
    expect(res.body.usernames).toContain('cashier');
    // Response must not contain sensitive fields
    expect(res.body.usernames.every((u: string) => typeof u === 'string')).toBe(true);
    expect(Object.keys(res.body)).toEqual(['usernames']);
    // Must not contain PII beyond usernames
    expect(res.body).not.toHaveProperty('ids');
    expect(res.body).not.toHaveProperty('roles');
    expect(res.body).not.toHaveProperty('pinHashes');
  });

  it('GET /auth/usernames excludes inactive users', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Create an inactive user, then update to inactive
    sqlite.exec(`
      INSERT INTO users (username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES ('inactive_user', '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Inactive', 2, 0, ${now}, ${now});
    `);

    const res = await request(app.getHttpServer()).get('/auth/usernames').expect(200);
    expect(res.body.usernames).toContain('admin');
    expect(res.body.usernames).not.toContain('inactive_user');
  });

  it('GET /auth/usernames?platform=android returns active users with android_login=1', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/usernames?platform=android')
      .expect(200);
    expect(res.body.usernames).toBeDefined();
    expect(Array.isArray(res.body.usernames)).toBe(true);
    // admin is seeded with android_login=0 (POS/back-office only) — must be hidden
    expect(res.body.usernames).not.toContain('admin');
    // cashier is seeded with android_login=1 — must be shown
    expect(res.body.usernames).toContain('cashier');
    // inactive user must stay excluded even with android_login default 1
    expect(res.body.usernames).not.toContain('inactive_user');
  });

  it('GET /auth/usernames?platform=android excludes users with android_login=0 (included without platform)', async () => {
    const now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO users (username, pin_hash, name, role_id, is_active, android_login, created_at, updated_at)
      VALUES ('android_hidden', '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Android Hidden', 2, 1, 0, ${now}, ${now});
    `);

    const all = await request(app.getHttpServer()).get('/auth/usernames').expect(200);
    expect(all.body.usernames).toContain('android_hidden');

    const android = await request(app.getHttpServer())
      .get('/auth/usernames?platform=android')
      .expect(200);
    expect(android.body.usernames).not.toContain('android_hidden');
  });

  it('GET /auth/usernames?platform=unknown treats unknown platform as no filter', async () => {
    const res = await request(app.getHttpServer()).get('/auth/usernames?platform=ios').expect(200);
    expect(res.body.usernames).toContain('admin');
    expect(res.body.usernames).toContain('android_hidden');
  });
});

describe('Business Day (e2e)', () => {
  it('POST /day/open opens a business day', async () => {
    const res = await request(app.getHttpServer())
      .post('/day/open')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ openingCashHalalas: 50000 })
      .expect(201);
    expect(res.body.status).toBe('open');
    expect(res.body.businessDate).toBeDefined();
  });

  it('POST /orders fails with no day open (double-open before close)', async () => {
    await request(app.getHttpServer())
      .post('/day/open')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ openingCashHalalas: 10000 })
      .expect(409);
  });

  it('GET /day/current returns open day with live totals', async () => {
    const res = await request(app.getHttpServer())
      .get('/day/current')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.open).toBe(true);
    expect(res.body.status).toBe('open');
    expect(res.body.liveSalesHalalas).toBe(0);
  });
});

describe('Orders (e2e)', () => {
  let orderId: number;
  let secondOrderId: number;

  it('POST /orders creates an order', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in', tableId: 1 })
      .expect(201);
    orderId = res.body.id;
    expect(res.body.orderNo).toBeGreaterThan(0);
  });

  it('POST /orders fails for dine_in without tableId', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'dine_in' })
      .expect(400);
  });

  it('POST /orders/:id/items adds item', async () => {
    // Get order to know its updatedAt
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/orders/${orderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ baseUpdatedAt: getRes.body.updatedAt, items: [{ itemId: 1, qty: 2 }] })
      .expect(200);
  });

  it('GET /orders/:id returns order with items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.totalHalalas).toBe(4600);
  });

  it('GET /orders/:id/events/verify returns valid', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}/events/verify`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.valid).toBe(true);
  });

  it('POST /orders/:id/pay transitions to paid (from open)', async () => {
    // Get the order to know its total
    const orderRes = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`);
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ payments: [{ methodId: 'cash', amountHalalas: orderRes.body.totalHalalas }] })
      .expect(201);
    expect(res.body.status).toBe('paid');
  });

  it('GET /reports/x returns live X-report with paymentTotals', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/x')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect('error' in res.body).toBe(false);
    expect(res.body.paidOrderCount).toBeGreaterThanOrEqual(1);
    expect(res.body.totalSalesHalalas).toBeGreaterThanOrEqual(4600);
    expect(Array.isArray(res.body.paymentTotals)).toBe(true);
  });

  it('POST /day/close fails when open orders exist', async () => {
    // Create an open order that blocks close
    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ type: 'takeaway' })
      .expect(201);
    secondOrderId = createRes.body.id;

    // Add an item so we can pay later — use bulk sync
    const getRes = await request(app.getHttpServer())
      .get(`/orders/${secondOrderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`/orders/${secondOrderId}/items/sync`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        baseUpdatedAt: getRes.body.updatedAt,
        items: [{ itemId: 1, qty: 1 }],
      })
      .expect(200);

    // Leave it open — should block close
    await request(app.getHttpServer())
      .post('/day/close')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ closingCashHalalas: 50000 })
      .expect(409);
  });

  it('pay the blocking order then close succeeds', async () => {
    // Get total for the second order
    const orderRes = await request(app.getHttpServer())
      .get(`/orders/${secondOrderId}`)
      .set('Authorization', `Bearer ${jwtToken}`);
    await request(app.getHttpServer())
      .post(`/orders/${secondOrderId}/pay`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ payments: [{ methodId: 'cash', amountHalalas: orderRes.body.totalHalalas }] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/day/close')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ closingCashHalalas: 55000 })
      .expect(201);
    expect(res.body.status).toBe('closed');
    expect(res.body.totalSalesHalalas).toBeGreaterThan(0);
  });

  it('GET /day/current returns { open: false } after day close', async () => {
    const res = await request(app.getHttpServer())
      .get('/day/current')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.open).toBe(false);
    expect(res.body.id).toBeUndefined();
  });

  it('GET /reports/z/:dayId returns Z-report', async () => {
    const days = await request(app.getHttpServer())
      .get('/day?page=1&limit=1')
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    const dayId = days.body.data[0].id;

    const res = await request(app.getHttpServer())
      .get(`/reports/z/${dayId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.totalSalesHalalas).toBeGreaterThan(0);
  });
});
