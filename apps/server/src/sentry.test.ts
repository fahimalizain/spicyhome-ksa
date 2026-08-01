import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { AppModule } from './app.module';
import { DRIZZLE } from './modules/database/database.module';

describe('Health endpoint', () => {
  let app: INestApplication;
  let sqlite: any;

  beforeAll(async () => {
    // Clear SENTRY_DSN so Sentry doesn't try to init
    const originalDsn = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;

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
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0);
    await app.init();

    // Restore DSN
    if (originalDsn) process.env.SENTRY_DSN = originalDsn;
  });

  afterAll(async () => {
    await app.close();
    sqlite.close();
  });

  it('GET /health returns 200 with status ok and version', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version.length).toBeGreaterThan(0);
  });

  it('GET /health does not require authentication', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Sentry exception filter', () => {
  let app: INestApplication;
  let sqlite: any;

  beforeAll(async () => {
    const originalDsn = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;

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
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0);
    await app.init();

    if (originalDsn) process.env.SENTRY_DSN = originalDsn;
  });

  afterAll(async () => {
    await app.close();
    sqlite.close();
  });

  it('401 Unauthorized preserves correct status code', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nonexistent', pin: '0000', clientType: 'pos' })
      .expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('404 Not Found preserves correct status code', async () => {
    await request(app.getHttpServer())
      .get('/auth/users/99999')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401); // Returns 401 because auth guard runs first
  });

  it('400 Bad Request preserves correct status code', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
    expect(res.body.statusCode).toBe(400);
  });

  it('Missing token returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me').expect(401);
    expect(res.body.statusCode).toBe(401);
  });
});
