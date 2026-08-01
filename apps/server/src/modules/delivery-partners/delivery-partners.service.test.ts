import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '@spicyhome/db';
import { DeliveryPartnersService } from './delivery-partners.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('DeliveryPartnersService', () => {
  let sqlite: any;
  let db: any;
  let service: DeliveryPartnersService;
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
      -- Minimal orders table: only the columns the disable-guard query reads.
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL,
        delivery_partner_id TEXT REFERENCES delivery_partners(id)
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

    db = drizzle(sqlite, { schema });
    service = new DeliveryPartnersService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  /** Raw SQL insert of an order referencing a partner (bypasses service). */
  const insertOrder = (status: string, partnerId: string | null) => {
    sqlite.exec(
      `INSERT INTO orders (status, delivery_partner_id) VALUES ('${status}', ${
        partnerId ? `'${partnerId}'` : 'NULL'
      })`,
    );
  };

  describe('list', () => {
    it('returns all partners sorted by sort_order then title', () => {
      const a = service.create({ title: 'Keeta' }, 1);
      service.create({ title: 'HungerStation' }, 1);
      sqlite.exec(`UPDATE delivery_partners SET sort_order = 1 WHERE id = '${a.id}'`);

      const partners = service.list();
      expect(partners).toHaveLength(2);
      expect(partners[0].id).toBe('hungerstation');
      expect(partners[1].id).toBe('keeta');
      expect(typeof partners[0].enabled).toBe('boolean');
    });
  });

  describe('listEnabled', () => {
    it('returns only enabled partners', () => {
      service.create({ title: 'HungerStation' }, 1);
      const keeta = service.create({ title: 'Keeta' }, 1);
      service.update(keeta.id, { enabled: false }, 1);

      const partners = service.listEnabled();
      expect(partners).toHaveLength(1);
      expect(partners[0].id).toBe('hungerstation');
    });
  });

  describe('create', () => {
    it('creates partner AND payment method with code 30 in one atomic write', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      expect(partner.id).toBe('hungerstation');
      expect(partner.title).toBe('HungerStation');
      expect(partner.enabled).toBe(true);
      expect(partner.sortOrder).toBe(0);
      expect(partner.createdBy).toBe(1);

      const method = db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, 'hungerstation'))
        .get();
      expect(method).toBeDefined();
      expect(method.id).toBe('hungerstation');
      expect(method.title).toBe('HungerStation');
      expect(method.zatcaPaymentMeansCode).toBe('30');
      expect(method.enabled).toBe(1);
      expect(method.sortOrder).toBe(0);
    });

    it('generates kebab-case slug identical to payment-methods slugify', () => {
      const partner = service.create({ title: '  STAR Delivery!!! ' }, 1);
      expect(partner.id).toBe('star-delivery');
      expect(partner.title).toBe('STAR Delivery!!!');
    });

    it('rejects empty slug (400)', () => {
      expect(() => service.create({ title: '!!!' }, 1)).toThrow(BadRequestException);
      expect(() => service.create({ title: '!!!' }, 1)).toThrow(
        'Title must contain at least one alphanumeric character',
      );
    });

    it('rejects duplicate slug against existing partner (409)', () => {
      service.create({ title: 'HungerStation' }, 1);
      expect(() => service.create({ title: 'hungerstation' }, 1)).toThrow(ConflictException);
      expect(() => service.create({ title: 'hungerstation' }, 1)).toThrow(
        'A delivery partner with slug "hungerstation" already exists',
      );
    });

    it('rejects slug that exists as a payment method (409, shared namespace)', () => {
      sqlite.exec(`
        INSERT INTO payment_methods (id, title, zatca_payment_means_code, enabled, sort_order, created_at, updated_at)
        VALUES ('cash', 'Cash', '10', 1, 0, ${now}, ${now});
      `);
      expect(() => service.create({ title: 'CASH' }, 1)).toThrow(ConflictException);
      expect(() => service.create({ title: 'CASH' }, 1)).toThrow(
        'A payment method with slug "cash" already exists',
      );
    });

    it('rolls back both rows when the payment method insert fails', () => {
      // Force the payment_methods insert to fail inside the transaction.
      sqlite.exec(`
        CREATE TRIGGER fail_method_insert BEFORE INSERT ON payment_methods
        WHEN NEW.title = 'Boom' BEGIN
          SELECT RAISE(ABORT, 'forced insert failure');
        END;
      `);
      expect(() => service.create({ title: 'Boom' }, 1)).toThrow('forced insert failure');
      const partner = db.select().from(schema.deliveryPartners).all();
      const methods = db.select().from(schema.paymentMethods).all();
      expect(partner).toHaveLength(0);
      expect(methods).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('throws NotFoundException for unknown slug', () => {
      expect(() => service.update('nonexistent', { title: 'X' }, 1)).toThrow(NotFoundException);
    });

    it('mirrors title change to the owned payment method', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      const updated = service.update(partner.id, { title: 'Hunger Station App' }, 1);
      expect(updated.title).toBe('Hunger Station App');
      expect(updated.id).toBe('hungerstation'); // slug immutable

      const method = db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, 'hungerstation'))
        .get();
      expect(method.title).toBe('Hunger Station App');
    });

    it('mirrors enabled 1 -> 0 to the owned payment method', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      const updated = service.update(partner.id, { enabled: false }, 1);
      expect(updated.enabled).toBe(false);

      const method = db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, 'hungerstation'))
        .get();
      expect(method.enabled).toBe(0);
    });

    it('mirrors enabled 0 -> 1 to the owned payment method', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      service.update(partner.id, { enabled: false }, 1);
      const updated = service.update(partner.id, { enabled: true }, 1);
      expect(updated.enabled).toBe(true);

      const method = db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, 'hungerstation'))
        .get();
      expect(method.enabled).toBe(1);
    });

    it('does NOT mirror sort_order to the owned payment method', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      const updated = service.update(partner.id, { sortOrder: 5 }, 1);
      expect(updated.sortOrder).toBe(5);

      const method = db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, 'hungerstation'))
        .get();
      expect(method.sortOrder).toBe(0); // deliberately divergent field
    });

    it('updates sort_order without touching the method', () => {
      const partner = service.create({ title: 'Keeta' }, 1);
      const updated = service.update(partner.id, { sortOrder: 3 }, 1);
      expect(updated.sortOrder).toBe(3);
      const method = db
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.id, 'keeta'))
        .get();
      expect(method.sortOrder).toBe(0);
    });

    it('rejects attempts to change the id (400)', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      expect(() => service.update(partner.id, { id: 'keeta', title: 'X' } as any, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.update(partner.id, { id: 'keeta', title: 'X' } as any, 1)).toThrow(
        'Delivery partner slug (id) is immutable',
      );
    });

    it('allows sending the same id (no-op)', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      const updated = service.update(partner.id, { id: 'hungerstation' } as any, 1);
      expect(updated.id).toBe('hungerstation');
    });
  });

  describe('disable guard (open orders)', () => {
    it('blocks disabling when an open order references the partner (409 with count)', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      insertOrder('open', partner.id);
      insertOrder('open', partner.id);
      insertOrder('paid', partner.id);

      expect(() => service.update(partner.id, { enabled: false }, 1)).toThrow(ConflictException);
      expect(() => service.update(partner.id, { enabled: false }, 1)).toThrow(
        '2 open order(s) still reference it',
      );
    });

    it('allows disabling when only paid/voided/refunded historical orders exist', () => {
      const partner = service.create({ title: 'HungerStation' }, 1);
      insertOrder('paid', partner.id);
      insertOrder('voided', partner.id);
      insertOrder('refunded', partner.id);
      insertOrder('paid', null);

      const updated = service.update(partner.id, { enabled: false }, 1);
      expect(updated.enabled).toBe(false);
    });

    it('allows disabling when no orders reference the partner', () => {
      const partner = service.create({ title: 'Keeta' }, 1);
      const updated = service.update(partner.id, { enabled: false }, 1);
      expect(updated.enabled).toBe(false);
    });

    it('allows a no-op disable (already disabled) without the guard', () => {
      const partner = service.create({ title: 'Keeta' }, 1);
      service.update(partner.id, { enabled: false }, 1);
      insertOrder('open', partner.id);
      // Still fine: the order existed before disabling, and no state change happens.
      const updated = service.update(partner.id, { enabled: false }, 1);
      expect(updated.enabled).toBe(false);
    });
  });

  describe('no DELETE', () => {
    it('exposes no delete/remove method (soft-disable only, ADR 0007)', () => {
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
