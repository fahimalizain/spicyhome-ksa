import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { BusinessDayService } from './business-day.service';
import { DRIZZLE } from '../database/database.module';

describe('BusinessDayService', () => {
  let sqlite: any;
  let db: any;
  let service: BusinessDayService;
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
      CREATE TABLE IF NOT EXISTS day_openings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_date TEXT NOT NULL,
        status TEXT NOT NULL,
        opening_cash_halalas INTEGER NOT NULL DEFAULT 0,
        opened_at INTEGER NOT NULL,
        opened_by INTEGER NOT NULL REFERENCES users(id),
        closed_at INTEGER,
        closed_by INTEGER REFERENCES users(id),
        closing_cash_halalas INTEGER,
        total_sales_halalas INTEGER,
        total_vat_halalas INTEGER,
        order_count INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no INTEGER NOT NULL,
        uuid TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        table_id INTEGER REFERENCES tables(id),
        day_opening_id INTEGER NOT NULL REFERENCES day_openings(id),
        status TEXT NOT NULL,
        subtotal_halalas INTEGER NOT NULL DEFAULT 0,
        vat_halalas INTEGER NOT NULL DEFAULT 0,
        total_halalas INTEGER NOT NULL DEFAULT 0,
        discount_halalas INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price_halalas INTEGER NOT NULL,
        vat_rate_bp INTEGER NOT NULL DEFAULT 1500,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS item_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        printer_id INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id),
        item_name TEXT NOT NULL,
        unit_price_halalas INTEGER NOT NULL,
        vat_rate_bp INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        total_halalas INTEGER NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    now = Math.floor(Date.now() / 1000);

    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, created_at, updated_at)
      VALUES (1, 'admin', 1, ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    service = new BusinessDayService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('openDay', () => {
    it('opens a new business day', async () => {
      const day = await service.openDay({ openingCashHalalas: 50000 }, 1);
      expect(day).not.toBeNull();
      expect(day!.businessDate).toBeDefined();
      expect(day!.status).toBe('open');
      expect(day!.openingCashHalalas).toBe(50000);
      expect(day!.openedBy).toBe(1);
    });

    it('throws conflict when day already open', async () => {
      await service.openDay({ openingCashHalalas: 50000 }, 1);
      await expect(
        service.openDay({ openingCashHalalas: 10000 }, 1),
      ).rejects.toThrow('already open');
    });

    it('business_date is today in YYYY-MM-DD format', async () => {
      const day = await service.openDay({ openingCashHalalas: 0 }, 1);
      expect(day!.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('closeDay', () => {
    it('closes the open day with frozen totals', async () => {
      await service.openDay({ openingCashHalalas: 50000 }, 1);
      const day = service.getOpenDay();
      expect(day).not.toBeNull();

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day!.id}, 'paid', 2000, 300, 2300, ${now}, ${now});
      `);

      const closed = await service.closeDay({ closingCashHalalas: 52300 }, 1);
      expect(closed.status).toBe('closed');
      expect(closed.totalSalesHalalas).toBe(2300);
      expect(closed.totalVatHalalas).toBe(300);
      expect(closed.orderCount).toBe(1);
      expect(closed.closingCashHalalas).toBe(52300);
      expect(closed.voidedOrderCount).toBe(0);
    });

    it('throws not found when no day is open', async () => {
      await expect(
        service.closeDay({ closingCashHalalas: 0 }, 1),
      ).rejects.toThrow('No open business day');
    });

    it('throws conflict when open/sent orders exist', async () => {
      await service.openDay({ openingCashHalalas: 0 }, 1);
      const day = service.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'sent', 2000, 300, 2300, ${now}, ${now});
      `);

      await expect(
        service.closeDay({ closingCashHalalas: 0 }, 1),
      ).rejects.toThrow('Cannot close day');
    });

    it('excludes voided orders from sales but counts them separately', async () => {
      await service.openDay({ openingCashHalalas: 0 }, 1);
      const day = service.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now});
      `);
      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (2, 2, 'b', 'takeaway', ${day.id}, 'voided', 1000, 150, 1150, ${now}, ${now});
      `);

      const closed = await service.closeDay({ closingCashHalalas: 2300 }, 1);
      expect(closed.totalSalesHalalas).toBe(2300);
      expect(closed.orderCount).toBe(1);
      expect(closed.voidedOrderCount).toBe(1);
    });

    it('computes totals only from paid orders', async () => {
      await service.openDay({ openingCashHalalas: 0 }, 1);
      const day = service.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now});
      `);
      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (2, 2, 'b', 'dine_in', ${day.id}, 'paid', 4000, 600, 4600, ${now}, ${now});
      `);

      const closed = await service.closeDay({ closingCashHalalas: 6900 }, 1);
      expect(closed.totalSalesHalalas).toBe(6900);
      expect(closed.totalVatHalalas).toBe(900);
      expect(closed.orderCount).toBe(2);
    });
  });

  describe('getCurrentDay', () => {
    it('returns null when no day is open', async () => {
      expect(service.getCurrentDay()).toBeNull();
    });

    it('returns open day with live totals', async () => {
      await service.openDay({ openingCashHalalas: 50000 }, 1);
      const day = service.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now});
      `);

      const current = service.getCurrentDay()!;
      expect(current).not.toBeNull();
      expect(current.liveSalesHalalas).toBe(2300);
      expect(current.liveVatHalalas).toBe(300);
      expect(current.liveOrderCount).toBe(1);
    });
  });

  describe('listDays', () => {
    it('returns empty list when no days', () => {
      const result = service.listDays();
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns paged list', async () => {
      await service.openDay({ openingCashHalalas: 0 }, 1);
      const day = service.getOpenDay()!;
      sqlite.exec(`
        UPDATE day_openings SET
          status = 'closed',
          closed_at = ${now},
          closed_by = 1,
          closing_cash_halalas = 0,
          total_sales_halalas = 0,
          total_vat_halalas = 0,
          order_count = 0,
          updated_at = ${now}
        WHERE id = ${day.id};
      `);

      const result = service.listDays();
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });
  });
});
