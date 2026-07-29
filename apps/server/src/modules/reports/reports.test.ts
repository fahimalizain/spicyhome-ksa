import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { ReportsService } from './reports.service';
import { BusinessDayService } from '../business-day/business-day.service';
import { PrintersService } from '../printers/printers.service';
import { FakePrinterTransport } from '../printers/printer-transport';

describe('ReportsService', () => {
  let sqlite: any;
  let db: any;
  let service: ReportsService;
  let dayService: BusinessDayService;
  let printersService: PrintersService;
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
      CREATE TABLE IF NOT EXISTS item_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        printer_id INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
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
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS printers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        connection_type TEXT NOT NULL DEFAULT 'tcp',
        windows_printer_name TEXT,
        ip TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 9100,
        role TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
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
      CREATE TABLE IF NOT EXISTS order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        method_id TEXT NOT NULL REFERENCES payment_methods(id),
        method_title TEXT NOT NULL,
        amount_halalas INTEGER NOT NULL,
        tendered_halalas INTEGER,
        change_halalas INTEGER,
        created_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS order_refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        method_id TEXT NOT NULL REFERENCES payment_methods(id),
        method_title TEXT NOT NULL,
        subtotal_halalas INTEGER NOT NULL,
        vat_halalas INTEGER NOT NULL,
        total_halalas INTEGER NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_at INTEGER,
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    now = Math.floor(Date.now() / 1000);

    // Seed payment methods
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at) VALUES ('cash', 'Cash', 1, 0, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at) VALUES ('card', 'Card', 1, 1, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, created_at, updated_at) VALUES ('mada', 'mada', 1, 2, ${now}, ${now});
    `);

    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, created_at, updated_at)
      VALUES (1, 'admin', 1, ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, ${now}, ${now});
      INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 'Burgers', 0, 1, ${now}, ${now});
      INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, is_active, created_at, updated_at)
      VALUES (1, 1, 'Zinger', 2300, 1500, 1, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    dayService = new BusinessDayService(db);
    printersService = new PrintersService(db);
    printersService.setTransport(new FakePrinterTransport());
    service = new ReportsService(db, dayService, printersService);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('getXReport', () => {
    it('returns error when no day is open', async () => {
      const report = await service.getXReport();
      expect('error' in report).toBe(true);
      expect((report as any).error).toBe('No open business day');
    });

    it('returns X-report with correct totals and paymentTotals', async () => {
      dayService.openDay({ openingCashHalalas: 50000 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (1, 'card', 'Card', 2300, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (2, 2, 'b', 'takeaway', ${day.id}, 'paid', 4000, 600, 4600, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (2, 'cash', 'Cash', 4600, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (3, 3, 'c', 'dine_in', ${day.id}, 'open', 1000, 150, 1150, ${now}, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (4, 4, 'd', 'takeaway', ${day.id}, 'voided', 500, 75, 575, ${now}, ${now});
      `);

      const report: any = await service.getXReport();
      expect(report.totalSalesHalalas).toBe(6900);
      expect(report.totalVatHalalas).toBe(900);
      expect(report.paidOrderCount).toBe(2);
      expect(report.openOrderCount).toBe(1);
      expect(report.voidedOrderCount).toBe(1);

      // Payment totals should be per-method
      expect(Array.isArray(report.paymentTotals)).toBe(true);
      expect(report.paymentTotals.length).toBe(2);
      const cardTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'card');
      const cashTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'cash');
      expect(cardTotal).toBeDefined();
      expect(cardTotal.totalHalalas).toBe(2300);
      expect(cashTotal).toBeDefined();
      expect(cashTotal.totalHalalas).toBe(4600);
    });

    it('handles split-tender paid orders with multiple payment methods', async () => {
      // Open day for split-tender test
      dayService.openDay({ openingCashHalalas: 10000 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (10, 10, 'split', 'dine_in', ${day.id}, 'paid', 8250, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (10, 'card', 'Card', 5000, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, tendered_halalas, change_halalas, created_at)
        VALUES (10, 'cash', 'Cash', 3250, 10000, 6750, ${now});
      `);

      const report: any = await service.getXReport();
      expect(Array.isArray(report.paymentTotals)).toBe(true);
      expect(report.paymentTotals.length).toBe(2);

      const cardTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'card');
      const cashTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'cash');
      expect(cardTotal.totalHalalas).toBe(5000);
      expect(cashTotal.totalHalalas).toBe(3250);
    });

    it('computes sales by type', async () => {
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, ${now}, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (2, 2, 'b', 'takeaway', ${day.id}, 'paid', 4000, ${now}, ${now});
      `);

      const report: any = await service.getXReport();
      expect(report.salesByType.dine_in.count).toBe(1);
      expect(report.salesByType.dine_in.totalHalalas).toBe(2000);
      expect(report.salesByType.takeaway.count).toBe(1);
      expect(report.salesByType.takeaway.totalHalalas).toBe(4000);
    });

    it('computes per-user sales', async () => {
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at, created_by)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2300, ${now}, ${now}, 1);
      `);

      const report: any = await service.getXReport();
      expect(report.salesByUser).toHaveLength(1);
      expect(report.salesByUser[0].userId).toBe(1);
      expect(report.salesByUser[0].totalHalalas).toBe(2300);
    });

    it('handles deleted items via snapshot fallback', async () => {
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;

      // Create a temp item, use it, then delete it (simulating deleted item)
      sqlite.exec(`
        INSERT INTO items (id, category_id, name, price_halalas, vat_rate_bp, is_active, created_at, updated_at)
        VALUES (2, 1, 'Temp Item', 2300, 1500, 1, ${now}, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2300, ${now}, ${now});
        INSERT INTO order_items (id, order_id, item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (1, 1, 2, 'Deleted Item', 2300, 1500, 1, 2300, ${now}, ${now});
      `);
      // Null out the FK reference so we can delete the item (simulates deleted item)
      sqlite.exec('UPDATE order_items SET item_id = NULL WHERE item_id = 2');
      sqlite.exec('DELETE FROM items WHERE id = 2');

      const report: any = await service.getXReport();
      expect(report.salesByCategory.length).toBeGreaterThanOrEqual(1);
      const uncat = report.salesByCategory.find((c: any) => c.categoryName === 'Uncategorized');
      expect(uncat).toBeDefined();
      expect(uncat.totalHalalas).toBe(2300);
    });

    it('paymentTotals include payments from refunded orders', async () => {
      dayService.openDay({ openingCashHalalas: 50000 }, 1);
      const day = dayService.getOpenDay()!;

      // Two paid orders: one stays paid, one gets fully refunded
      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (1, 'cash', 'Cash', 2300, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (2, 2, 'b', 'takeaway', ${day.id}, 'refunded', 1000, 150, 1150, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (2, 'card', 'Card', 1150, ${now});
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, created_at)
        VALUES (2, 1, 'card', 'Card', 1000, 150, 1150, ${now});
      `);

      const report: any = await service.getXReport();

      // Both payments should be in totals (refunded order payments still count)
      const cashTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'cash');
      const cardTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'card');
      expect(cashTotal.totalHalalas).toBe(2300);
      expect(cardTotal.totalHalalas).toBe(1150);
    });

    it('expected cash subtracts cash refunds for the day', async () => {
      dayService.openDay({ openingCashHalalas: 50000 }, 1);
      const day = dayService.getOpenDay()!;

      // Order paid with cash, then fully refunded with cash
      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'refunded', 2000, 300, 2300, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, amount_halalas, created_at)
        VALUES (1, 'cash', 'Cash', 2300, ${now});
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, subtotal_halalas, vat_halalas, total_halalas, created_at)
        VALUES (1, 1, 'cash', 'Cash', 2000, 300, 2300, ${now});
      `);

      // Install a receipt printer so printXReport works
      sqlite.exec(`
        INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
        VALUES (1, 'Counter', '192.168.1.50', 9100, 'receipt', 1, ${now}, ${now});
      `);

      const transport = new FakePrinterTransport();
      printersService.setTransport(transport);

      const result = await service.printXReport();
      expect(result.success).toBe(true);

      // Capture printed output
      const sent = transport.sent;
      expect(sent.length).toBeGreaterThanOrEqual(1);
      const printData = sent[sent.length - 1].data.toString('ascii');
      // Expected cash = opening(50000) + cashPayments(2300) - cashRefunds(2300) = 50000 = 500.00 SAR
      expect(printData).toContain('500.00');
    });
  });

  describe('getZReport', () => {
    it('returns Z-report for closed day', async () => {
      dayService.openDay({ openingCashHalalas: 50000 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'a', 'dine_in', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now});
      `);

      dayService.closeDay({ closingCashHalalas: 52300 }, 1);
      const closed = dayService.getOpenDay();
      expect(closed).toBeNull();

      const report = await service.getZReport(day.id);
      expect(report.status).toBe('closed');
      expect(report.totalSalesHalalas).toBe(2300);
      expect(report.totalVatHalalas).toBe(300);
      expect(report.closingCashHalalas).toBe(52300);
    });

    it('throws NotFoundException for non-existent day', async () => {
      await expect(service.getZReport(999)).rejects.toThrow('Business day not found');
    });
  });

  describe('getSalesRange', () => {
    it('returns daily totals over range', async () => {
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;
      sqlite.exec(`
        UPDATE day_openings SET
          status = 'closed',
          closed_at = ${now},
          closing_cash_halalas = 0,
          total_sales_halalas = 1000,
          total_vat_halalas = 130,
          order_count = 1,
          updated_at = ${now}
        WHERE id = ${day.id};
      `);

      const result = await service.getSalesRange('2020-01-01', '2099-12-31');
      expect(result.days.length).toBeGreaterThan(0);
      expect(result.days[0].totalSalesHalalas).toBe(1000);
    });
  });

  describe('getVatSummary', () => {
    it('returns VAT summary with grand total', async () => {
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;
      sqlite.exec(`
        UPDATE day_openings SET
          status = 'closed',
          closed_at = ${now},
          closing_cash_halalas = 0,
          total_sales_halalas = 2300,
          total_vat_halalas = 300,
          order_count = 1,
          updated_at = ${now}
        WHERE id = ${day.id};
      `);

      const result = await service.getVatSummary('2020-01-01', '2099-12-31');
      expect(result.days.length).toBeGreaterThan(0);
      expect(result.grandTotal.salesInclHalalas).toBe(2300);
      expect(result.grandTotal.vatHalalas).toBe(300);
      expect(result.grandTotal.salesExclHalalas).toBe(2000);
    });
  });
});
