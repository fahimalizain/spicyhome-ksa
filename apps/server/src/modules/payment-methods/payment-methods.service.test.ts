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
        zatca_payment_means_code TEXT NOT NULL DEFAULT '10',
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS delivery_partners (
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
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('card', 'Card', 1, 1, '48', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('mada', 'mada', 1, 2, '48', ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    service = new PaymentMethodsService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  /** Seed a delivery partner + its owned method (ADR 0007 coupling). */
  const seedPartner = (id: string, title: string) => {
    sqlite.exec(`
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('${id}', '${title}', 1, 0, ${now}, ${now});
      INSERT INTO payment_methods (id, title, zatca_payment_means_code, enabled, sort_order, created_at, updated_at)
      VALUES ('${id}', '${title}', '30', 1, 0, ${now}, ${now});
    `);
  };

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

    it('derives isDeliveryPartner from delivery_partners membership', () => {
      seedPartner('hungerstation', 'HungerStation');
      const methods = service.list();
      const byId = new Map(methods.map((m: any) => [m.id, m]));
      expect(byId.get('hungerstation').isDeliveryPartner).toBe(true);
      expect(byId.get('hungerstation').zatcaPaymentMeansCode).toBe('30');
      expect(byId.get('cash').isDeliveryPartner).toBe(false);
      expect(byId.get('card').isDeliveryPartner).toBe(false);
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

    it('derives isDeliveryPartner on enabled methods too', () => {
      seedPartner('hungerstation', 'HungerStation');
      // Disable the partner-owned method → it must disappear from the list.
      sqlite.exec(`UPDATE payment_methods SET enabled = 0 WHERE id = 'hungerstation'`);
      const methods = service.listEnabled();
      expect(methods.map((m: any) => m.id)).not.toContain('hungerstation');
    });

    it('returns isDeliveryPartner true for an enabled partner-owned method', () => {
      seedPartner('hungerstation', 'HungerStation');
      const methods = service.listEnabled();
      const hs = methods.find((m: any) => m.id === 'hungerstation');
      expect(hs).toBeDefined();
      expect(hs.isDeliveryPartner).toBe(true);
    });
  });

  describe('get', () => {
    it('returns a payment method by slug', () => {
      const method = service.get('cash');
      expect(method.id).toBe('cash');
      expect(method.title).toBe('Cash');
      expect(method.zatcaPaymentMeansCode).toBe('10');
      expect(method.enabled).toBe(true);
    });

    it('throws NotFoundException for unknown slug', () => {
      expect(() => service.get('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a payment method with slug from title', () => {
      const method = service.create({ title: 'STC Pay', zatcaPaymentMeansCode: '30' }, 1);
      expect(method.id).toBe('stc-pay');
      expect(method.title).toBe('STC Pay');
      expect(method.zatcaPaymentMeansCode).toBe('30');
      expect(method.enabled).toBe(true);
      expect(method.sortOrder).toBe(0);
    });

    it('generates kebab-case slug and returns row', () => {
      const method = service.create({ title: 'Apple Pay', zatcaPaymentMeansCode: '48' }, 1);
      expect(method.id).toBe('apple-pay');
      expect(method.title).toBe('Apple Pay');
      expect(method.zatcaPaymentMeansCode).toBe('48');
    });

    it('accepts any allow-listed ZATCA code', () => {
      for (const code of ['10', '30', '42', '48', '1']) {
        const method = service.create({ title: `Pay ${code}`, zatcaPaymentMeansCode: code }, 1);
        expect(method.zatcaPaymentMeansCode).toBe(code);
      }
    });

    it('rejects create without zatcaPaymentMeansCode (400)', () => {
      expect(() => service.create({ title: 'No Code' } as any, 1)).toThrow(BadRequestException);
      expect(() => service.create({ title: 'No Code' } as any, 1)).toThrow(
        'zatcaPaymentMeansCode must be one of',
      );
    });

    it('rejects create with non-allow-listed code (400)', () => {
      expect(() => service.create({ title: 'Bad Code', zatcaPaymentMeansCode: '55' }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.create({ title: 'Bad Code', zatcaPaymentMeansCode: '55' }, 1)).toThrow(
        'zatcaPaymentMeansCode must be one of',
      );
    });

    it('collapses multiple hyphens and trims', () => {
      const method = service.create({ title: '  My   Pay!!! ', zatcaPaymentMeansCode: '42' }, 1);
      expect(method.id).toBe('my-pay');
    });

    it('rejects title that produces empty slug (400)', () => {
      expect(() => service.create({ title: '!!!', zatcaPaymentMeansCode: '10' }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.create({ title: '!!!', zatcaPaymentMeansCode: '10' }, 1)).toThrow(
        'Title must contain at least one alphanumeric character',
      );
    });

    it('rejects title of only hyphens (400)', () => {
      expect(() => service.create({ title: '---', zatcaPaymentMeansCode: '10' }, 1)).toThrow(
        BadRequestException,
      );
    });

    it('rejects duplicate slug (409)', () => {
      expect(() => service.create({ title: 'Cash', zatcaPaymentMeansCode: '10' }, 1)).toThrow(
        ConflictException,
      );
      expect(() => service.create({ title: 'Cash', zatcaPaymentMeansCode: '10' }, 1)).toThrow(
        'A payment method with slug "cash" already exists',
      );
    });

    it('rejects slug that exists as a delivery partner (409, shared namespace)', () => {
      // Partner row only (no owned method yet) — isolates the partner-collision
      // branch from the payment-methods duplicate check.
      sqlite.exec(`
        INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
        VALUES ('hungerstation', 'HungerStation', 1, 0, ${now}, ${now});
      `);
      expect(() =>
        service.create({ title: 'HungerStation', zatcaPaymentMeansCode: '30' }, 1),
      ).toThrow(ConflictException);
      expect(() =>
        service.create({ title: 'HungerStation', zatcaPaymentMeansCode: '30' }, 1),
      ).toThrow('A delivery partner with slug "hungerstation" already exists');
    });

    it('trims whitespace from title', () => {
      const method = service.create({ title: '  SADAD  ', zatcaPaymentMeansCode: '30' }, 1);
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

    it('updates the ZATCA payment means code for a non-cash method', () => {
      const method = service.update('card', { zatcaPaymentMeansCode: '42' }, 1);
      expect(method.zatcaPaymentMeansCode).toBe('42');
    });

    it('rejects updating to a non-allow-listed code (400)', () => {
      expect(() => service.update('card', { zatcaPaymentMeansCode: '55' }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.update('card', { zatcaPaymentMeansCode: '55' }, 1)).toThrow(
        'zatcaPaymentMeansCode must be one of',
      );
    });

    it('allows keeping cash code at 10', () => {
      const method = service.update('cash', { zatcaPaymentMeansCode: '10' }, 1);
      expect(method.zatcaPaymentMeansCode).toBe('10');
    });

    it('rejects changing the cash code away from 10 (403)', () => {
      expect(() => service.update('cash', { zatcaPaymentMeansCode: '48' }, 1)).toThrow(
        ForbiddenException,
      );
      expect(() => service.update('cash', { zatcaPaymentMeansCode: '48' }, 1)).toThrow(
        'The cash payment method ZATCA payment means code cannot be changed from 10',
      );
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
      expect(() => service.update('nonexistent', { title: 'Test' }, 1)).toThrow(NotFoundException);
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

  describe('partner-owned method locks (ADR 0007)', () => {
    beforeEach(() => {
      seedPartner('hungerstation', 'HungerStation');
    });

    it('rejects title change on a partner-owned method (403)', () => {
      expect(() => service.update('hungerstation', { title: 'HS App' }, 1)).toThrow(
        ForbiddenException,
      );
      expect(() => service.update('hungerstation', { title: 'HS App' }, 1)).toThrow(
        'managed via Delivery Partners',
      );
    });

    it('rejects enabled change on a partner-owned method (403)', () => {
      expect(() => service.update('hungerstation', { enabled: false }, 1)).toThrow(
        ForbiddenException,
      );
      expect(() => service.update('hungerstation', { enabled: false }, 1)).toThrow(
        'managed via Delivery Partners',
      );
      expect(() => service.update('hungerstation', { enabled: true }, 1)).toThrow(
        ForbiddenException,
      );
    });

    it('rejects zatca code change away from 30 on a partner-owned method (403)', () => {
      expect(() => service.update('hungerstation', { zatcaPaymentMeansCode: '48' }, 1)).toThrow(
        ForbiddenException,
      );
      expect(() => service.update('hungerstation', { zatcaPaymentMeansCode: '48' }, 1)).toThrow(
        'cannot be changed from 30',
      );
    });

    it('allows keeping the zatca code at 30 (no-op)', () => {
      const method = service.update('hungerstation', { zatcaPaymentMeansCode: '30' }, 1);
      expect(method.zatcaPaymentMeansCode).toBe('30');
    });

    it('allows sortOrder changes on a partner-owned method (divergent field)', () => {
      const method = service.update('hungerstation', { sortOrder: 7 }, 1);
      expect(method.sortOrder).toBe(7);
    });

    it('allows combined sortOrder-only updates', () => {
      const method = service.update('hungerstation', { sortOrder: 2 }, 1);
      expect(method.sortOrder).toBe(2);
      expect(method.title).toBe('HungerStation');
      expect(method.enabled).toBe(true);
    });
  });
});
