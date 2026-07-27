import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { PaymentMethodsService } from './payment-methods.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('PaymentMethodsService', () => {
  let sqlite: any;
  let db: any;
  let service: PaymentMethodsService;
  let now: number;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        create_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        pin_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role_id INTEGER NOT NULL REFERENCES user_roles(id),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
    `);

    now = Math.floor(Date.now() / 1000);

    // Seed user (needed for FK)
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, created_at, updated_at)
      VALUES (1, 'admin', 1, ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, ${now}, ${now});
    `);

    // Seed default payment methods
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('mada', 'mada', 1, 2, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    service = new PaymentMethodsService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('list', () => {
    it('returns all payment methods sorted by sort_order then title', () => {
      const methods = service.list();
      expect(methods).toHaveLength(3);
      expect(methods[0].id).toBe('cash');
      expect(methods[1].id).toBe('card');
      expect(methods[2].id).toBe('mada');
      // Verify enabled is a boolean after mapBools
      expect(typeof methods[0].enabled).toBe('boolean');
    });
  });

  describe('listEnabled', () => {
    it('returns only enabled methods', () => {
      // Disable mada
      sqlite.exec(`UPDATE payment_methods SET enabled = 0 WHERE id = 'mada'`);
      const methods = service.listEnabled();
      expect(methods).toHaveLength(2);
      expect(methods.map((m: any) => m.id)).not.toContain('mada');
    });

    it('excludes all disabled methods when multiple are disabled', () => {
      sqlite.exec(`
        UPDATE payment_methods SET enabled = 0 WHERE id = 'card';
        UPDATE payment_methods SET enabled = 0 WHERE id = 'mada';
      `);
      const methods = service.listEnabled();
      expect(methods).toHaveLength(1);
      expect(methods[0].id).toBe('cash');
    });
  });

  describe('get', () => {
    it('returns a payment method by slug', () => {
      const method = service.get('cash');
      expect(method.id).toBe('cash');
      expect(method.title).toBe('Cash');
      expect(method.enabled).toBe(true);
    });

    it('throws NotFoundException for unknown slug', () => {
      expect(() => service.get('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a payment method with slug from title', () => {
      const method = service.create({ title: 'STC Pay' }, 1);
      expect(method.id).toBe('stc-pay');
      expect(method.title).toBe('STC Pay');
      expect(method.enabled).toBe(true);
      expect(method.sortOrder).toBe(0);
    });

    it('generates kebab-case slug and returns row', () => {
      const method = service.create({ title: 'Apple Pay' }, 1);
      expect(method.id).toBe('apple-pay');
      expect(method.title).toBe('Apple Pay');
    });

    it('collapses multiple hyphens and trims', () => {
      const method = service.create({ title: '  My   Pay!!! ' }, 1);
      expect(method.id).toBe('my-pay');
    });

    it('rejects title that produces empty slug (400)', () => {
      expect(() => service.create({ title: '!!!' }, 1)).toThrow(BadRequestException);
      expect(() => service.create({ title: '!!!' }, 1)).toThrow(
        'Title must contain at least one alphanumeric character',
      );
    });

    it('rejects title of only hyphens (400)', () => {
      expect(() => service.create({ title: '---' }, 1)).toThrow(BadRequestException);
    });

    it('rejects duplicate slug (409)', () => {
      expect(() => service.create({ title: 'Cash' }, 1)).toThrow(ConflictException);
      expect(() => service.create({ title: 'Cash' }, 1)).toThrow(
        'A payment method with slug "cash" already exists',
      );
    });

    it('trims whitespace from title', () => {
      const method = service.create({ title: '  SADAD  ' }, 1);
      expect(method.id).toBe('sadad');
      expect(method.title).toBe('SADAD');
    });
  });

  describe('update', () => {
    it('renames a non-cash method', () => {
      const method = service.update('card', { title: 'Debit Card' }, 1);
      expect(method.title).toBe('Debit Card');
      expect(method.id).toBe('card'); // slug immutable
    });

    it('updates sortOrder', () => {
      const method = service.update('mada', { sortOrder: 5 }, 1);
      expect(method.sortOrder).toBe(5);
    });

    it('disables a non-cash method', () => {
      const method = service.update('card', { enabled: false }, 1);
      expect(method.enabled).toBe(false);
    });

    it('re-enables a disabled method', () => {
      service.update('card', { enabled: false }, 1);
      const method = service.update('card', { enabled: true }, 1);
      expect(method.enabled).toBe(true);
    });

    it('allows reordering cash sortOrder', () => {
      const method = service.update('cash', { sortOrder: 99 }, 1);
      expect(method.sortOrder).toBe(99);
    });

    it('rejects renaming cash (403)', () => {
      expect(() => service.update('cash', { title: 'Money' }, 1)).toThrow(ForbiddenException);
      expect(() => service.update('cash', { title: 'Money' }, 1)).toThrow(
        'The cash payment method title cannot be changed',
      );
    });

    it('rejects disabling cash (403)', () => {
      expect(() => service.update('cash', { enabled: false }, 1)).toThrow(ForbiddenException);
      expect(() => service.update('cash', { enabled: false }, 1)).toThrow(
        'The cash payment method cannot be disabled',
      );
    });

    it('rejects updating unknown id (404)', () => {
      expect(() => service.update('nonexistent', { title: 'Test' }, 1)).toThrow(
        NotFoundException,
      );
    });

    it('slug is immutable — slug not changeable even if title changes', () => {
      // Slug is the PK; update endpoint cannot change it
      // The service never modifies the id column; we just verify the slug stays the same
      const method = service.update('card', { title: 'Plastic' }, 1);
      expect(method.id).toBe('card');
      expect(method.title).toBe('Plastic');
    });

    it('update with no changes returns the method as-is', () => {
      const method = service.update('mada', {}, 1);
      expect(method.id).toBe('mada');
      expect(method.title).toBe('mada');
    });
  });
});
