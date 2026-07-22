import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SpicyHomeClient } from '@spicyhome/client-ts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { AppModule } from './app.module';
import { DRIZZLE } from './modules/database/database.module';
import * as http from 'http';

let app: INestApplication;
let sqlite: Database.Database;
let server: http.Server;
let client: SpicyHomeClient;
let token: string;

function getPort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, () => {
      const addr = s.address();
      const port = typeof addr === 'string' ? 0 : addr?.port || 0;
      s.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const port = await getPort();

  sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DRIZZLE)
    .useValue(db)
    .compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  await app.listen(port);
  const httpServer = app.getHttpServer();

  client = new SpicyHomeClient({
    baseUrl: `http://127.0.0.1:${port}`,
    getToken: () => token,
  });
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe('Client contract test', () => {
  let categoryId: number;
  let itemId: number;
  let orderId: number;

  it('login succeeds with correct credentials', async () => {
    const res = await client.auth.login({ username: 'admin', pin: '1234' });
    expect(res.accessToken).toBeDefined();
    expect(typeof res.accessToken).toBe('string');
    token = res.accessToken;
  });

  it('login fails with wrong credentials', async () => {
    await expect(
      client.auth.login({ username: 'admin', pin: '0000' }),
    ).rejects.toThrow();
  });

  it('createRole returns camelCase shape matching listRoles', async () => {
    const created: any = await client.auth.createRole({
      name: 'tester',
      createOrder: true,
      manageMenu: true,
    } as any);
    expect(created.id).toBeDefined();
    expect(typeof created.createOrder).toBe('number');
    expect(typeof created.manageMenu).toBe('number');
    expect('create_order' in created).toBe(false);

    const roles: any = await client.auth.listRoles();
    const found = roles.find((r: any) => r.id === created.id);
    expect(found).toBeDefined();
    expect(found.name).toBe('tester');
    expect(Object.keys(found).sort()).toEqual(Object.keys(created).sort());
  });

  it('creates a category', async () => {
    const res: any = await client.menu.createCategory({
      name: 'Burgers',
      sortOrder: 0,
      isActive: true,
    });
    expect(res.id).toBeDefined();
    expect(res.name).toBe('Burgers');
    categoryId = res.id;
  });

  it('lists categories', async () => {
    const res: any = await client.menu.listCategories();
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThanOrEqual(1);
  });

  it('gets a category by id', async () => {
    const res: any = await client.menu.getCategory(categoryId);
    expect(res.id).toBe(categoryId);
    expect(res.name).toBe('Burgers');
  });

  it('creates an item', async () => {
    const res: any = await client.menu.createItem({
      categoryId,
      name: 'Zinger Burger',
      priceHalalas: 2300,
      vatRateBp: 1500,
      sortOrder: 0,
      isActive: true,
    });
    expect(res.id).toBeDefined();
    expect(res.name).toBe('Zinger Burger');
    itemId = res.id;
  });

  it('lists items', async () => {
    const res: any = await client.menu.listItems();
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThanOrEqual(1);
  });

  it('lists items filtered by category', async () => {
    const res: any = await client.menu.listItems(categoryId);
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeGreaterThanOrEqual(1);
  });

  it('gets an item by id', async () => {
    const res: any = await client.menu.getItem(itemId);
    expect(res.id).toBe(itemId);
    expect(res.priceHalalas).toBe(2300);
  });

  it('creates a table', async () => {
    const res: any = await client.tables.create({
      name: 'T1',
      sortOrder: 0,
      isActive: true,
    });
    expect(res.id).toBeDefined();
  });

  it('creates an order', async () => {
    const tablesRes: any = await client.tables.list();
    const tableId = tablesRes[0]?.id || 1;

    const res: any = await client.orders.create({
      type: 'dine_in',
      tableId,
    });
    expect(res.id).toBeDefined();
    expect(res.orderNo).toBeGreaterThan(0);
    orderId = res.id;
  });

  it('adds item to order', async () => {
    const res: any = await client.orders.addItem(orderId, {
      itemId,
      qty: 2,
    });
    expect(res.success).toBe(true);
  });

  it('gets order with items', async () => {
    const res: any = await client.orders.get(orderId);
    expect(res.id).toBe(orderId);
    expect(res.items).toBeDefined();
    expect(res.items.length).toBe(1);
    expect(res.items[0].itemName).toBe('Zinger Burger');
    expect(res.items[0].qty).toBe(2);
    expect(res.totalHalalas).toBe(4600);
  });

  it('verifies audit chain is valid', async () => {
    const res: any = await client.orders.verifyAuditChain(orderId);
    expect(res.valid).toBe(true);
  });

  it('sends order to kitchen', async () => {
    const res: any = await client.orders.send(orderId);
    expect(res.status).toBe('sent');
  });

  it('pays order', async () => {
    const res: any = await client.orders.pay(orderId);
    expect(res.status).toBe('paid');
  });

  it('voids a new order', async () => {
    const tablesRes: any = await client.tables.list();
    const tableId = tablesRes[0]?.id || 1;

    const newOrder: any = await client.orders.create({
      type: 'takeaway',
    });
    const voided: any = await client.orders.void(newOrder.id);
    expect(voided.status).toBe('voided');
  });
});
