import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  const now = Math.floor(Date.now() / 1000);

  sqlite.exec(`
    INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'T1', 0, 1, ${now}, ${now});
  `);

  sqlite.exec(`
    INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
    VALUES (1, 'Burgers', 0, 1, ${now}, ${now});
  `);

  sqlite.exec(`
    INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, sort_order, is_active, created_at, updated_at)
    VALUES (1, 1, 'Zinger Burger', 2300, 1500, 0, 1, ${now}, ${now});
  `);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username: 'admin', pin: '1234' });
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
      .send({ username: 'admin', pin: '1234' })
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
});

describe('Orders (e2e)', () => {
  let orderId: number;

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
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ itemId: 1, qty: 2 })
      .expect(201);
  });

  it('GET /orders/:id returns order with items', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.totalHalalas).toBe(4600);
  });

  it('GET /orders/:id/audit/verify returns valid', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}/audit/verify`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(200);
    expect(res.body.valid).toBe(true);
  });

  it('POST /orders/:id/send transitions to sent', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/send`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);
    expect(res.body.status).toBe('sent');
  });

  it('POST /orders/:id/pay transitions to paid', async () => {
    const res = await request(app.getHttpServer())
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);
    expect(res.body.status).toBe('paid');
  });
});
