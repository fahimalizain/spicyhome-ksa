/**
 * SPA fallback regression — REST is mounted under /api while SPA document
 * routes (/orders, /admin, /reports, ...) serve index.html.
 *
 * SPA_DIST is read by configureHttpApp at call time (not by AppModule at
 * import time), so the env var can be set at file top and the statically
 * imported AppModule is reused from the shared module cache like in every
 * other test file.
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { AppModule } from './app.module';
import { DRIZZLE } from './modules/database/database.module';
import { configureHttpApp } from './configure-http-app';

const fs = require('fs');
const os = require('os');
const path = require('path');

const originalSpaDist = process.env.SPA_DIST;
const spaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-fallback-'));
fs.writeFileSync(
  path.join(spaDir, 'index.html'),
  '<!doctype html><html><body>spa-ok</body></html>',
);
process.env.SPA_DIST = spaDir;

describe('SPA fallback', () => {
  let app: INestApplication;
  let sqlite: Database.Database;

  beforeAll(async () => {
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

    app = configureHttpApp(moduleFixture.createNestApplication());
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    sqlite.close();
    fs.rmSync(spaDir, { recursive: true, force: true });
    // Restore the environment for later test files in the same worker.
    if (originalSpaDist === undefined) {
      delete process.env.SPA_DIST;
    } else {
      process.env.SPA_DIST = originalSpaDist;
    }
  });

  it('GET /orders serves the SPA index.html (Ctrl+R on an SPA route)', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders')
      .set('Accept', 'text/html')
      .expect(200);
    expect(res.text).toContain('spa-ok');
  });

  it('GET /admin serves the SPA index.html', async () => {
    const res = await request(app.getHttpServer()).get('/admin').expect(200);
    expect(res.text).toContain('spa-ok');
  });

  it('GET /reports serves the SPA index.html', async () => {
    const res = await request(app.getHttpServer()).get('/reports').expect(200);
    expect(res.text).toContain('spa-ok');
  });

  it('GET /api/orders without auth returns 401 Missing token', async () => {
    const res = await request(app.getHttpServer()).get('/api/orders').expect(401);
    expect(res.body.message).toBe('Missing token');
  });

  it('GET /health stays unprefixed and returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});
