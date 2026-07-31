import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { hashSync } from 'bcryptjs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { getNextServiceDayBoundaryUnix } from '@spicyhome/shared';
import { AuthService } from './auth.service';
import { DRIZZLE } from '../database/database.module';

describe('AuthService — JWT expiry', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let sqlite: any;
  let db: any;
  let nowSec: number;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    nowSec = Math.floor(Date.now() / 1000);

    // Minimal schema for auth tests
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        create_order INTEGER NOT NULL DEFAULT 0,
        update_order INTEGER NOT NULL DEFAULT 0,
        delete_order_item INTEGER NOT NULL DEFAULT 0,
        void_order INTEGER NOT NULL DEFAULT 0,
        refund_order INTEGER NOT NULL DEFAULT 0,
        pay_order INTEGER NOT NULL DEFAULT 0,
        manage_menu INTEGER NOT NULL DEFAULT 0,
        manage_tables INTEGER NOT NULL DEFAULT 0,
        manage_printers INTEGER NOT NULL DEFAULT 0,
        manage_users INTEGER NOT NULL DEFAULT 0,
        manage_settings INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        pin_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role_id INTEGER NOT NULL REFERENCES user_roles(id),
        is_active INTEGER NOT NULL DEFAULT 1,
        android_login INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
    `);

    // Seed an admin role and user
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES (1, 'admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${nowSec}, ${nowSec});
    `);

    const pinHash = hashSync('1234', 10);
    sqlite.exec(`
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', '${pinHash}', 'Administrator', 1, 1, ${nowSec}, ${nowSec});
    `);

    // Cashier is active and visible on Android login (android_login defaults to 1)
    sqlite.exec(`
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (2, 'cashier', '${pinHash}', 'Cashier', 1, 1, ${nowSec}, ${nowSec});
    `);

    // Manager is active on POS but hidden from Android login (android_login = 0)
    sqlite.exec(`
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, android_login, created_at, updated_at)
      VALUES (3, 'manager', '${pinHash}', 'Manager', 1, 1, 0, ${nowSec}, ${nowSec});
    `);

    db = drizzle(sqlite, { schema });
  });

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          // No expiresIn — exp is set explicitly in the payload.
        }),
      ],
      providers: [AuthService, { provide: DRIZZLE, useValue: db }],
    }).compile();

    service = moduleFixture.get(AuthService);
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('login', () => {
    it('issues a JWT with exp matching next service-day boundary', async () => {
      const loginNow = Date.now();
      const { accessToken } = await service.login('admin', '1234');

      // Decode and verify
      const decoded = jwtService.verify(accessToken) as any;
      expect(decoded.sub).toBe(1);
      expect(decoded.username).toBe('admin');
      expect(decoded.roleId).toBe(1);

      // exp must be a number (Unix seconds)
      expect(typeof decoded.exp).toBe('number');

      // exp must match getNextServiceDayBoundaryUnix computed at login time
      const expectedExp = getNextServiceDayBoundaryUnix(loginNow);
      expect(decoded.exp).toBe(expectedExp);
    });

    it('rejects invalid credentials', async () => {
      await expect(service.login('admin', '0000')).rejects.toThrow('Invalid credentials');
    });

    it('rejects unknown username', async () => {
      await expect(service.login('nonexistent', '1234')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('listUsernames', () => {
    it('returns all active usernames when no platform is given', () => {
      const { usernames } = service.listUsernames();
      expect(usernames).toContain('admin');
      expect(usernames).toContain('cashier');
      expect(usernames).toContain('manager');
    });

    it('returns active usernames for unknown platform values (treated as no platform)', () => {
      const { usernames } = service.listUsernames('ios');
      expect(usernames).toContain('admin');
      expect(usernames).toContain('cashier');
      expect(usernames).toContain('manager');
    });

    it('returns only android_login=1 usernames for platform=android', () => {
      const { usernames } = service.listUsernames('android');
      expect(usernames).toContain('admin');
      expect(usernames).toContain('cashier');
      expect(usernames).not.toContain('manager');
    });

    it('excludes inactive users even when android_login=1', () => {
      const now = Math.floor(Date.now() / 1000);
      sqlite.exec(`
        INSERT INTO users (username, pin_hash, name, role_id, is_active, android_login, created_at, updated_at)
        VALUES ('inactive_android', '${hashSync('0000', 10)}', 'Inactive Android', 1, 0, 1, ${now}, ${now});
      `);

      const { usernames } = service.listUsernames('android');
      expect(usernames).not.toContain('inactive_android');
      const { usernames: all } = service.listUsernames();
      expect(all).not.toContain('inactive_android');
    });

    it('sorts usernames alphabetically', () => {
      const { usernames } = service.listUsernames();
      const sorted = [...usernames].sort();
      expect(usernames).toEqual(sorted);
    });
  });

  describe('updateUser', () => {
    it('sets androidLogin to 0', () => {
      const updated = service.updateUser(2, { androidLogin: false }, nowSec);
      expect(updated.androidLogin).toBe(false);
      const row = sqlite.prepare('SELECT android_login FROM users WHERE id = 2').get() as any;
      expect(row.android_login).toBe(0);
    });

    it('sets androidLogin back to 1', () => {
      const updated = service.updateUser(2, { androidLogin: true }, nowSec);
      expect(updated.androidLogin).toBe(true);
      const row = sqlite.prepare('SELECT android_login FROM users WHERE id = 2').get() as any;
      expect(row.android_login).toBe(1);
    });

    it('leaves androidLogin unchanged when not provided', () => {
      service.updateUser(3, { name: 'Manager Renamed' }, nowSec);
      const row = sqlite.prepare('SELECT android_login FROM users WHERE id = 3').get() as any;
      expect(row.android_login).toBe(0);
    });
  });

  describe('expired token', () => {
    it('verify rejects an expired token', async () => {
      // Sign a token with an exp that is already in the past
      const expiredPayload = {
        sub: 1,
        username: 'admin',
        roleId: 1,
        exp: nowSec - 10, // 10 seconds in the past
      };
      const expiredToken = jwtService.sign(expiredPayload);

      // Direct JWT verification should throw
      expect(() => jwtService.verify(expiredToken)).toThrow();
    });

    it('verify accepts a token that is still valid', async () => {
      const validPayload = {
        sub: 1,
        username: 'admin',
        roleId: 1,
        exp: nowSec + 3600, // 1 hour from now
      };
      const validToken = jwtService.sign(validPayload);

      const decoded = jwtService.verify(validToken) as any;
      expect(decoded.sub).toBe(1);
      expect(decoded.exp).toBe(nowSec + 3600);
    });
  });
});
