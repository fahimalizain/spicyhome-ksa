import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { BadRequestException } from '@nestjs/common';
import { getServiceDayBoundsUnix } from '@spicyhome/shared';
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
      CREATE TABLE IF NOT EXISTS item_subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES item_categories(id),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        subcategory_id INTEGER REFERENCES item_subcategories(id),
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
        is_standard_invoice INTEGER NOT NULL DEFAULT 0,
        zatca_buyer_details TEXT,
        document_id TEXT NOT NULL DEFAULT '',
        delivery_partner_id TEXT,
        delivery_external_ref TEXT,
        promotion_id INTEGER,
        promotion_name TEXT,
        promotion_name_ar TEXT,
        promotion_percent_bp INTEGER,
        notes TEXT,
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
        item_name_ar TEXT,
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
      CREATE TABLE IF NOT EXISTS order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        method_id TEXT NOT NULL REFERENCES payment_methods(id),
        method_title TEXT NOT NULL,
        zatca_payment_means_code TEXT NOT NULL DEFAULT '10',
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
        zatca_payment_means_code TEXT NOT NULL DEFAULT '10',
        subtotal_halalas INTEGER NOT NULL,
        vat_halalas INTEGER NOT NULL,
        total_halalas INTEGER NOT NULL,
        discount_halalas INTEGER NOT NULL DEFAULT 0,
        reason TEXT,
        document_id TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_at INTEGER,
        updated_by INTEGER REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS order_refund_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        refund_id INTEGER NOT NULL REFERENCES order_refunds(id) ON DELETE CASCADE,
        order_item_id INTEGER REFERENCES order_items(id),
        item_name TEXT NOT NULL,
        item_name_ar TEXT,
        unit_price_halalas INTEGER NOT NULL,
        vat_rate_bp INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        total_halalas INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        event_idx INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    now = Math.floor(Date.now() / 1000);

    // Seed payment methods
    sqlite.exec(`
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at) VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at) VALUES ('card', 'Card', 1, 1, '48', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at) VALUES ('mada', 'mada', 1, 2, '48', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at) VALUES ('hungerstation', 'HungerStation', 1, 3, '30', ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at) VALUES ('keeta', 'Keeta', 1, 4, '30', ${now}, ${now});
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('hungerstation', 'HungerStation', 1, 0, ${now}, ${now});
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('keeta', 'Keeta', 1, 1, ${now}, ${now});
    `);

    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, created_at, updated_at)
      VALUES (1, 'admin', 1, ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, ${now}, ${now});
      INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 'Burgers', 0, 1, ${now}, ${now});
      INSERT INTO item_subcategories (id, category_id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 1, 'Chicken', 0, 1, ${now}, ${now});
      INSERT INTO items (id, category_id, subcategory_id, name, price_halalas, vat_rate_bp, is_active, created_at, updated_at)
      VALUES (1, 1, 1, 'Zinger', 2300, 1500, 1, ${now}, ${now});
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
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (1, 'card', 'Card', '48', 2300, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (2, 2, 'b', 'takeaway', ${day.id}, 'paid', 4000, 600, 4600, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (2, 'cash', 'Cash', '10', 4600, ${now});
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
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (10, 'card', 'Card', '48', 5000, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, tendered_halalas, change_halalas, created_at)
        VALUES (10, 'cash', 'Cash', '10', 3250, 10000, 6750, ${now});
      `);

      const report: any = await service.getXReport();
      expect(Array.isArray(report.paymentTotals)).toBe(true);
      expect(report.paymentTotals.length).toBe(2);

      const cardTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'card');
      const cashTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'cash');
      expect(cardTotal.totalHalalas).toBe(5000);
      expect(cashTotal.totalHalalas).toBe(3250);
    });

    it('uses payable and post-Allowance VAT for promoted paid orders', async () => {
      // Canonical 100.00 / 10% → sales 9000, VAT 1174 (ADR 0009 §9).
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, discount_halalas, created_at, updated_at, created_by)
        VALUES (20, 20, 'promo-x', 'dine_in', ${day.id}, 'paid', 8696, 1304, 10000, 1000, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (20, 'cash', 'Cash', '10', 9000, ${now});
      `);

      const report: any = await service.getXReport();
      expect(report.totalSalesHalalas).toBe(9000);
      expect(report.totalVatHalalas).toBe(1174);
      expect(report.paidOrderCount).toBe(1);
      expect(report.salesByType.dine_in.totalHalalas).toBe(9000);
      expect(report.salesByUser[0].totalHalalas).toBe(9000);
      // Payment buckets stay on collected cash (already payable).
      const cashTotal = report.paymentTotals.find((pt: any) => pt.methodId === 'cash');
      expect(cashTotal.totalHalalas).toBe(9000);
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
        INSERT INTO items (id, category_id, subcategory_id, name, price_halalas, vat_rate_bp, is_active, created_at, updated_at)
        VALUES (2, 1, 1, 'Temp Item', 2300, 1500, 1, ${now}, ${now});
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
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (1, 'cash', 'Cash', '10', 2300, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at, created_by)
        VALUES (2, 2, 'b', 'takeaway', ${day.id}, 'refunded', 1000, 150, 1150, ${now}, ${now}, 1);
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (2, 'card', 'Card', '48', 1150, ${now});
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
        VALUES (2, 1, 'card', 'Card', '48', 1000, 150, 1150, 'REF26-TEST1', ${now});
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
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (1, 'cash', 'Cash', '10', 2300, ${now});
        INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
        VALUES (1, 1, 'cash', 'Cash', '10', 2000, 300, 2300, 'REF26-TEST2', ${now});
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

    it('prints sales by payment method from live payments on the Z-report', async () => {
      dayService.openDay({ openingCashHalalas: 0 }, 1);
      const day = dayService.getOpenDay()!;

      sqlite.exec(`
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (1, 1, 'hs', 'takeaway', ${day.id}, 'paid', 2000, 300, 2300, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (1, 'hungerstation', 'HungerStation', '30', 2300, ${now});
        INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
        VALUES (2, 2, 'kt', 'takeaway', ${day.id}, 'paid', 4000, 600, 4600, ${now}, ${now});
        INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
        VALUES (2, 'keeta', 'Keeta', '30', 4600, ${now});
        INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
        VALUES (1, 'Counter', '192.168.1.50', 9100, 'receipt', 1, ${now}, ${now});
      `);

      dayService.closeDay({ closingCashHalalas: 0 }, 1);

      const transport = new FakePrinterTransport();
      printersService.setTransport(transport);

      const result = await service.printZReport(day.id);
      expect(result.success).toBe(true);

      const printData = transport.sent[transport.sent.length - 1].data.toString('ascii');
      expect(printData).toContain('SALES BY PAYMENT METHOD');
      expect(printData).toContain('HungerStation');
      expect(printData).toContain('23.00');
      expect(printData).toContain('Keeta');
      expect(printData).toContain('46.00');
      expect(printData).not.toContain('Card');
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

  describe('getSalesRegister', () => {
    // Fixed service-day windows around 2026-08-20 (Riyadh 05:00 = UTC 02:00).
    const D = getServiceDayBoundsUnix('2026-08-20')!; // [D 05:00, D+1 05:00)
    const D1 = getServiceDayBoundsUnix('2026-08-21')!; // D+1
    const D2 = getServiceDayBoundsUnix('2026-08-22')!; // D+2
    const dayId1 = 100;
    const dayId2 = 101;

    const insertDay = (id: number, businessDate: string, openedAt: number) => {
      sqlite.exec(
        `INSERT INTO day_openings (id, business_date, status, opened_at, opened_by, created_at, updated_at)
         VALUES (${id}, '${businessDate}', 'closed', ${openedAt}, 1, ${openedAt}, ${openedAt})`,
      );
    };

    const insertOrder = (o: {
      id: number;
      status: string;
      totalHalalas: number;
      documentId: string;
      type?: string;
      dayOpeningId?: number;
      subtotalHalalas?: number;
      vatHalalas?: number;
      discountHalalas?: number;
      orderNo?: number;
      tableId?: number | null;
      deliveryPartnerId?: string | null;
      notes?: string | null;
      createdBy?: number | null;
    }) => {
      sqlite.exec(
        `INSERT INTO orders (id, order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, discount_halalas, document_id, delivery_partner_id, notes, created_at, updated_at, created_by)
         VALUES (${o.id}, ${o.orderNo ?? o.id}, 'uuid-${o.id}', '${o.type ?? 'dine_in'}', ${
           o.tableId === undefined ? 'NULL' : o.tableId
         }, ${o.dayOpeningId ?? dayId1}, '${o.status}', ${o.subtotalHalalas ?? 0}, ${
           o.vatHalalas ?? 0
         }, ${o.totalHalalas}, ${o.discountHalalas ?? 0}, '${o.documentId}', ${
           o.deliveryPartnerId === undefined || o.deliveryPartnerId === null
             ? 'NULL'
             : `'${o.deliveryPartnerId}'`
         }, ${o.notes === undefined || o.notes === null ? 'NULL' : `'${o.notes}'`}, ${now}, ${now}, ${
           o.createdBy === undefined || o.createdBy === null ? 'NULL' : o.createdBy
         })`,
      );
    };

    const insertPayment = (p: {
      id: number;
      orderId: number;
      methodId: string;
      methodTitle?: string;
      amountHalalas: number;
      createdAt: number;
      createdBy?: number | null;
    }) => {
      sqlite.exec(
        `INSERT INTO order_payments (id, order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at, created_by)
         VALUES (${p.id}, ${p.orderId}, '${p.methodId}', '${p.methodTitle ?? p.methodId}', '10', ${
           p.amountHalalas
         }, ${p.createdAt}, ${
           p.createdBy === undefined || p.createdBy === null ? 'NULL' : p.createdBy
         })`,
      );
    };

    const insertRefund = (r: {
      id: number;
      orderId: number;
      methodId: string;
      methodTitle?: string;
      subtotalHalalas: number;
      vatHalalas: number;
      totalHalalas: number;
      documentId: string;
      createdAt: number;
      userId?: number;
    }) => {
      sqlite.exec(
        `INSERT INTO order_refunds (id, order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
         VALUES (${r.id}, ${r.orderId}, ${r.userId ?? 1}, '${r.methodId}', '${
           r.methodTitle ?? r.methodId
         }', '10', ${r.subtotalHalalas}, ${r.vatHalalas}, ${r.totalHalalas}, '${
           r.documentId
         }', ${r.createdAt})`,
      );
    };

    beforeEach(() => {
      insertDay(dayId1, '2026-08-20', D.startUnix);
      insertDay(dayId2, '2026-08-21', D1.startUnix);
      sqlite.exec(
        `INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
         VALUES (1, 'T1', 0, 1, ${now}, ${now})`,
      );
    });

    it('throws 400 for missing or invalid from/to', () => {
      expect(() => service.getSalesRegister({})).toThrow(BadRequestException);
      expect(() => service.getSalesRegister({ from: '2026-08-20' })).toThrow(BadRequestException);
      expect(() => service.getSalesRegister({ to: '2026-08-20' })).toThrow(BadRequestException);
      expect(() => service.getSalesRegister({ from: '20-08-2026', to: '2026-08-21' })).toThrow(
        BadRequestException,
      );
      expect(() => service.getSalesRegister({ from: '2026-13-01', to: '2026-08-21' })).toThrow(
        BadRequestException,
      );
      expect(() => service.getSalesRegister({ from: '2026-08-20', to: 'not-a-date' })).toThrow(
        BadRequestException,
      );
      // Same wording as OrdersService.listOrders
      expect(() => service.getSalesRegister({ from: 'bogus', to: '2026-08-21' })).toThrow(
        'Invalid date: bogus (expected YYYY-MM-DD)',
      );
    });

    it('throws 400 when from > to', () => {
      expect(() => service.getSalesRegister({ from: '2026-08-22', to: '2026-08-20' })).toThrow(
        BadRequestException,
      );
    });

    it('throws 400 for invalid type or kind filters', () => {
      expect(() =>
        service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20', type: 'delivery' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20', kind: 'invoice' }),
      ).toThrow(BadRequestException);
    });

    it('excludes open and voided orders, and paid orders without payments', () => {
      insertOrder({ id: 1, status: 'open', totalHalalas: 1000, documentId: 'INV-OPEN' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 1000,
        createdAt: D.startUnix + 60,
      });
      insertOrder({ id: 2, status: 'voided', totalHalalas: 2000, documentId: 'INV-VOID' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2000,
        createdAt: D.startUnix + 120,
      });
      insertOrder({ id: 3, status: 'paid', totalHalalas: 3000, documentId: 'INV-NOPAY' });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(0);
      expect(result.footer).toEqual({
        saleCount: 0,
        refundCount: 0,
        subtotalHalalas: 0,
        vatHalalas: 0,
        totalHalalas: 0,
      });
    });

    it('returns a paid order as a positive sale row with tenders and cashier', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        type: 'dine_in',
        tableId: 1,
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'INV26-0001',
        notes: 'Call on arrival',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 300,
        createdBy: 1,
      });
      // A second paid order whose payments carry no cashier
      insertOrder({
        id: 2,
        status: 'paid',
        type: 'takeaway',
        subtotalHalalas: 1000,
        vatHalalas: 150,
        totalHalalas: 1150,
        documentId: 'INV26-0002',
      });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'card',
        methodTitle: 'Card',
        amountHalalas: 1150,
        createdAt: D.startUnix + 400,
        createdBy: null,
      });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(2);

      const sale = result.rows[0];
      expect(sale.kind).toBe('sale');
      expect(sale.postedAt).toBe(D.startUnix + 300);
      expect(sale.businessDate).toBe('2026-08-20');
      expect(sale.documentId).toBe('INV26-0001');
      expect(sale.orderId).toBe(1);
      expect(sale.refundId).toBeNull();
      expect(sale.orderNo).toBe(1);
      expect(sale.type).toBe('dine_in');
      expect(sale.tableId).toBe(1);
      expect(sale.tableName).toBe('T1');
      expect(sale.deliveryPartnerId).toBeNull();
      expect(sale.deliveryPartnerTitle).toBeNull();
      expect(sale.subtotalHalalas).toBe(2000);
      expect(sale.vatHalalas).toBe(300);
      expect(sale.totalHalalas).toBe(2300);
      expect(sale.tenders).toEqual([
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 },
      ]);
      expect(sale.cashierUserId).toBe(1);
      expect(sale.cashierName).toBe('Admin');
      expect(sale.notes).toBe('Call on arrival');

      const noCashier = result.rows[1];
      expect(noCashier.cashierUserId).toBeNull();
      expect(noCashier.cashierName).toBe('Unknown');
    });

    it('sale row uses payable and post-Allowance VAT when order has a Discount', () => {
      // Canonical 100.00 / 10% → total 9000, vat 1174, excl 7826.
      insertOrder({
        id: 1,
        status: 'paid',
        type: 'dine_in',
        subtotalHalalas: 8696,
        vatHalalas: 1304,
        totalHalalas: 10000,
        discountHalalas: 1000,
        documentId: 'INV26-PROMO',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 9000,
        createdAt: D.startUnix + 300,
        createdBy: 1,
      });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(1);
      const sale = result.rows[0];
      expect(sale.totalHalalas).toBe(9000);
      expect(sale.vatHalalas).toBe(1174);
      expect(sale.subtotalHalalas).toBe(7826);
      expect(result.footer.totalHalalas).toBe(9000);
      expect(result.footer.vatHalalas).toBe(1174);
      expect(result.footer.subtotalHalalas).toBe(7826);
    });

    it('returns a refund as a separate negative row sorted after its sale', () => {
      insertOrder({
        id: 1,
        status: 'refunded',
        type: 'dine_in',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'INV26-0001',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 400,
        createdBy: 1,
      });
      insertRefund({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'REF26-0001',
        createdAt: D.startUnix + 900,
      });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].kind).toBe('sale');
      expect(result.rows[1].kind).toBe('refund');

      const refund = result.rows[1];
      expect(refund.postedAt).toBe(D.startUnix + 900);
      expect(refund.businessDate).toBe('2026-08-20');
      expect(refund.documentId).toBe('REF26-0001');
      expect(refund.orderId).toBe(1);
      expect(refund.refundId).toBe(1);
      expect(refund.orderNo).toBe(1);
      expect(refund.type).toBe('dine_in');
      expect(refund.subtotalHalalas).toBe(-2000);
      expect(refund.vatHalalas).toBe(-300);
      expect(refund.totalHalalas).toBe(-2300);
      expect(refund.tenders).toEqual([
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 2300 },
      ]);
      expect(refund.cashierUserId).toBe(1);
      expect(refund.cashierName).toBe('Admin');
      expect(refund.notes).toBe('Refund of INV26-0001');

      // The sale row survives with positive amounts
      expect(result.rows[0].totalHalalas).toBe(2300);
      expect(result.rows[0].refundId).toBeNull();
    });

    it('ties at the same postedAt: sale before refund', () => {
      insertOrder({
        id: 1,
        status: 'refunded',
        totalHalalas: 2300,
        documentId: 'INV26-0001',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 500,
      });
      insertRefund({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'REF26-0001',
        createdAt: D.startUnix + 500,
      });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows.map((r) => r.kind)).toEqual(['sale', 'refund']);
    });

    it('posts a sale and its later refund to their own service days', () => {
      insertOrder({
        id: 1,
        status: 'refunded',
        type: 'takeaway',
        subtotalHalalas: 1000,
        vatHalalas: 150,
        totalHalalas: 1150,
        documentId: 'INV26-0100',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 1150,
        createdAt: D.startUnix + 100,
      });
      insertRefund({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 1000,
        vatHalalas: 150,
        totalHalalas: 1150,
        documentId: 'REF26-0100',
        createdAt: D2.startUnix + 50, // D+2
      });

      const onlyD = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(onlyD.rows).toHaveLength(1);
      expect(onlyD.rows[0].kind).toBe('sale');
      expect(onlyD.rows[0].businessDate).toBe('2026-08-20');

      const onlyD2 = service.getSalesRegister({ from: '2026-08-22', to: '2026-08-22' });
      expect(onlyD2.rows).toHaveLength(1);
      expect(onlyD2.rows[0].kind).toBe('refund');
      expect(onlyD2.rows[0].businessDate).toBe('2026-08-22');
      expect(onlyD2.rows[0].notes).toBe('Refund of INV26-0100');

      const both = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-22' });
      expect(both.rows).toHaveLength(2);
      expect(both.rows[0].kind).toBe('sale');
      expect(both.rows[1].kind).toBe('refund');
      expect(both.rows[1].businessDate).toBe('2026-08-22');
    });

    it('posts a payment after 05:00 to the next service day regardless of day_opening', () => {
      // Order opened under the 2026-08-20 business day, but paid at
      // 2026-08-21 05:00:10 — the sale must post to 2026-08-21.
      insertOrder({
        id: 1,
        status: 'paid',
        dayOpeningId: dayId1,
        subtotalHalalas: 5000,
        vatHalalas: 750,
        totalHalalas: 5750,
        documentId: 'INV26-0200',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'card',
        methodTitle: 'Card',
        amountHalalas: 5750,
        createdAt: D1.startUnix + 10,
      });

      const onD = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(onD.rows).toHaveLength(0);

      const onD1 = service.getSalesRegister({ from: '2026-08-21', to: '2026-08-21' });
      expect(onD1.rows).toHaveLength(1);
      expect(onD1.rows[0].kind).toBe('sale');
      expect(onD1.rows[0].postedAt).toBe(D1.startUnix + 10);
      expect(onD1.rows[0].businessDate).toBe('2026-08-21');
    });

    it('filters by type on the parent order, excluding takeaway refunds too', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        type: 'dine_in',
        totalHalalas: 1000,
        documentId: 'INV-A',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 1000,
        createdAt: D.startUnix + 10,
      });
      insertOrder({
        id: 2,
        status: 'paid',
        type: 'takeaway',
        totalHalalas: 2000,
        documentId: 'INV-B',
      });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2000,
        createdAt: D.startUnix + 20,
      });
      insertOrder({
        id: 3,
        status: 'refunded',
        type: 'takeaway',
        subtotalHalalas: 3000,
        vatHalalas: 0,
        totalHalalas: 3000,
        documentId: 'INV-C',
      });
      insertPayment({
        id: 3,
        orderId: 3,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 3000,
        createdAt: D.startUnix + 30,
      });
      insertRefund({
        id: 1,
        orderId: 3,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 3000,
        vatHalalas: 0,
        totalHalalas: 3000,
        documentId: 'REF-C',
        createdAt: D.startUnix + 40,
      });

      const result = service.getSalesRegister({
        from: '2026-08-20',
        to: '2026-08-20',
        type: 'dine_in',
      });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].documentId).toBe('INV-A');
      expect(result.footer.refundCount).toBe(0);
    });

    it('filters by partner: none for walk-ins, slug for exact partner', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        type: 'takeaway',
        totalHalalas: 1000,
        documentId: 'INV-P1',
        deliveryPartnerId: 'hungerstation',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'hungerstation',
        methodTitle: 'HungerStation',
        amountHalalas: 1000,
        createdAt: D.startUnix + 10,
      });
      insertOrder({
        id: 2,
        status: 'paid',
        type: 'takeaway',
        totalHalalas: 2000,
        documentId: 'INV-P2',
        deliveryPartnerId: null,
      });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2000,
        createdAt: D.startUnix + 20,
      });

      const walkIns = service.getSalesRegister({
        from: '2026-08-20',
        to: '2026-08-20',
        partner: 'none',
      });
      expect(walkIns.rows).toHaveLength(1);
      expect(walkIns.rows[0].documentId).toBe('INV-P2');

      const hungerstation = service.getSalesRegister({
        from: '2026-08-20',
        to: '2026-08-20',
        partner: 'hungerstation',
      });
      expect(hungerstation.rows).toHaveLength(1);
      expect(hungerstation.rows[0].documentId).toBe('INV-P1');
      expect(hungerstation.rows[0].deliveryPartnerId).toBe('hungerstation');
      expect(hungerstation.rows[0].deliveryPartnerTitle).toBe('HungerStation');

      const unknown = service.getSalesRegister({
        from: '2026-08-20',
        to: '2026-08-20',
        partner: 'keeta',
      });
      expect(unknown.rows).toHaveLength(0);
    });

    it('kind=refund returns only refund rows', () => {
      insertOrder({
        id: 1,
        status: 'refunded',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'INV26-0001',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 100,
      });
      insertRefund({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'REF26-0001',
        createdAt: D.startUnix + 200,
      });

      const refunds = service.getSalesRegister({
        from: '2026-08-20',
        to: '2026-08-20',
        kind: 'refund',
      });
      expect(refunds.rows).toHaveLength(1);
      expect(refunds.rows[0].kind).toBe('refund');
      expect(refunds.footer.saleCount).toBe(0);
      expect(refunds.footer.refundCount).toBe(1);

      const sales = service.getSalesRegister({
        from: '2026-08-20',
        to: '2026-08-20',
        kind: 'sale',
      });
      expect(sales.rows).toHaveLength(1);
      expect(sales.rows[0].kind).toBe('sale');
      expect(sales.footer.saleCount).toBe(1);
      expect(sales.footer.refundCount).toBe(0);
    });

    it('computes footer counts and signed totals across sales and refunds', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'INV26-0001',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 100,
      });
      insertOrder({
        id: 2,
        status: 'paid',
        subtotalHalalas: 4000,
        vatHalalas: 600,
        totalHalalas: 4600,
        documentId: 'INV26-0002',
      });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'card',
        methodTitle: 'Card',
        amountHalalas: 4600,
        createdAt: D.startUnix + 200,
      });
      insertOrder({
        id: 3,
        status: 'refunded',
        subtotalHalalas: 1000,
        vatHalalas: 150,
        totalHalalas: 1150,
        documentId: 'INV26-0003',
      });
      insertPayment({
        id: 3,
        orderId: 3,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 1150,
        createdAt: D.startUnix + 300,
      });
      insertRefund({
        id: 1,
        orderId: 3,
        methodId: 'cash',
        methodTitle: 'Cash',
        subtotalHalalas: 1000,
        vatHalalas: 150,
        totalHalalas: 1150,
        documentId: 'REF26-0001',
        createdAt: D.startUnix + 400,
      });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.footer).toEqual({
        saleCount: 3,
        refundCount: 1,
        subtotalHalalas: 2000 + 4000 + 1000 - 1000,
        vatHalalas: 300 + 600 + 150 - 150,
        totalHalalas: 2300 + 4600 + 1150 - 1150,
      });
    });

    it('lists every tender on a split-tender sale and uses the earliest as cashier', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        subtotalHalalas: 8000,
        vatHalalas: 250,
        totalHalalas: 8250,
        documentId: 'INV-SPLIT',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'card',
        methodTitle: 'Card',
        amountHalalas: 5000,
        createdAt: D.startUnix + 10,
        createdBy: 1,
      });
      insertPayment({
        id: 2,
        orderId: 1,
        methodId: 'cash',
        methodTitle: 'Cash',
        amountHalalas: 3250,
        createdAt: D.startUnix + 20,
        createdBy: 1,
      });

      const result = service.getSalesRegister({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(1);
      const sale = result.rows[0];
      expect(sale.postedAt).toBe(D.startUnix + 10);
      expect(sale.tenders).toEqual([
        { methodId: 'card', methodTitle: 'Card', amountHalalas: 5000 },
        { methodId: 'cash', methodTitle: 'Cash', amountHalalas: 3250 },
      ]);
      expect(sale.cashierUserId).toBe(1);
      expect(sale.cashierName).toBe('Admin');
      expect(sale.totalHalalas).toBe(8250);
    });
  });

  describe('getItemWiseSales', () => {
    // Fixed service-day windows around 2026-08-20 (Riyadh 05:00 = UTC 02:00).
    const D = getServiceDayBoundsUnix('2026-08-20')!; // [D 05:00, D+1 05:00)
    const D2 = getServiceDayBoundsUnix('2026-08-22')!; // D+2
    const dayId1 = 100;
    const dayId2 = 101;

    const insertDay = (id: number, businessDate: string, openedAt: number) => {
      sqlite.exec(
        `INSERT INTO day_openings (id, business_date, status, opened_at, opened_by, created_at, updated_at)
         VALUES (${id}, '${businessDate}', 'closed', ${openedAt}, 1, ${openedAt}, ${openedAt})`,
      );
    };

    const insertOrder = (o: {
      id: number;
      status: string;
      totalHalalas: number;
      documentId: string;
      type?: string;
      deliveryPartnerId?: string | null;
    }) => {
      sqlite.exec(
        `INSERT INTO orders (id, order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, delivery_partner_id, created_at, updated_at, created_by)
         VALUES (${o.id}, ${o.id}, 'uuid-${o.id}', '${o.type ?? 'dine_in'}', NULL, ${dayId1}, '${
           o.status
         }', 0, 0, ${o.totalHalalas}, '${o.documentId}', ${
           o.deliveryPartnerId === undefined || o.deliveryPartnerId === null
             ? 'NULL'
             : `'${o.deliveryPartnerId}'`
         }, ${now}, ${now}, 1)`,
      );
    };

    const insertPayment = (p: {
      id: number;
      orderId: number;
      methodId: string;
      amountHalalas: number;
      createdAt: number;
    }) => {
      sqlite.exec(
        `INSERT INTO order_payments (id, order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at, created_by)
         VALUES (${p.id}, ${p.orderId}, '${p.methodId}', '${p.methodId}', '10', ${p.amountHalalas}, ${
           p.createdAt
         }, 1)`,
      );
    };

    const insertRefund = (r: {
      id: number;
      orderId: number;
      methodId: string;
      subtotalHalalas: number;
      vatHalalas: number;
      totalHalalas: number;
      documentId: string;
      createdAt: number;
    }) => {
      sqlite.exec(
        `INSERT INTO order_refunds (id, order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
         VALUES (${r.id}, ${r.orderId}, 1, '${r.methodId}', '${r.methodId}', '10', ${
           r.subtotalHalalas
         }, ${r.vatHalalas}, ${r.totalHalalas}, '${r.documentId}', ${r.createdAt})`,
      );
    };

    const insertOrderItem = (o: {
      id: number;
      orderId: number;
      itemId?: number | null;
      itemName: string;
      unitPriceHalalas: number;
      qty: number;
      totalHalalas: number;
    }) => {
      sqlite.exec(
        `INSERT INTO order_items (id, order_id, item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
         VALUES (${o.id}, ${o.orderId}, ${
           o.itemId === undefined || o.itemId === null ? 'NULL' : o.itemId
         }, '${o.itemName}', ${o.unitPriceHalalas}, 1500, ${o.qty}, ${o.totalHalalas}, ${now}, ${now})`,
      );
    };

    const insertRefundItem = (r: {
      id: number;
      refundId: number;
      orderItemId?: number | null;
      itemName: string;
      unitPriceHalalas: number;
      qty: number;
      totalHalalas: number;
    }) => {
      sqlite.exec(
        `INSERT INTO order_refund_items (id, refund_id, order_item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at)
         VALUES (${r.id}, ${r.refundId}, ${
           r.orderItemId === undefined || r.orderItemId === null ? 'NULL' : r.orderItemId
         }, '${r.itemName}', ${r.unitPriceHalalas}, 1500, ${r.qty}, ${r.totalHalalas}, ${now})`,
      );
    };

    const insertCategory = (id: number, name: string, sortOrder: number) => {
      sqlite.exec(
        `INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
         VALUES (${id}, '${name}', ${sortOrder}, 1, ${now}, ${now})`,
      );
    };

    const insertItem = (id: number, categoryId: number, name: string, priceHalalas: number) => {
      sqlite.exec(
        `INSERT INTO items (id, category_id, subcategory_id, name, price_halalas, vat_rate_bp, is_active, created_at, updated_at)
         VALUES (${id}, ${categoryId}, 1, '${name}', ${priceHalalas}, 1500, 1, ${now}, ${now})`,
      );
    };

    beforeEach(() => {
      insertDay(dayId1, '2026-08-20', D.startUnix);
      insertDay(dayId2, '2026-08-21', D2.startUnix - 86400);
    });

    it('throws 400 for missing or invalid from/to, type, and category', () => {
      expect(() => service.getItemWiseSales({})).toThrow(BadRequestException);
      expect(() => service.getItemWiseSales({ from: '2026-08-20' })).toThrow(BadRequestException);
      expect(() => service.getItemWiseSales({ to: '2026-08-20' })).toThrow(BadRequestException);
      expect(() => service.getItemWiseSales({ from: '20-08-2026', to: '2026-08-21' })).toThrow(
        BadRequestException,
      );
      expect(() => service.getItemWiseSales({ from: '2026-08-22', to: '2026-08-20' })).toThrow(
        BadRequestException,
      );
      expect(() =>
        service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20', type: 'delivery' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20', category: 'abc' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20', category: '1.5' }),
      ).toThrow(BadRequestException);
    });

    it('rolls two paid orders with the same item_id into one row, summing qty and gross', () => {
      insertOrder({ id: 1, status: 'paid', totalHalalas: 4600, documentId: 'INV-1' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 4600,
        createdAt: D.startUnix + 100,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 2,
        totalHalalas: 4600,
      });
      insertOrder({ id: 2, status: 'paid', totalHalalas: 2300, documentId: 'INV-2' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 200,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });

      const result = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        itemId: 1,
        itemName: 'Zinger',
        categoryId: 1,
        categoryName: 'Burgers',
        qtySold: 3,
        grossHalalas: 6900,
        refundedQty: 0,
        refundedHalalas: 0,
        netQty: 3,
        netHalalas: 6900,
        vatHalalas: 900, // decomposeVat(4600) + decomposeVat(2300)
      });
    });

    it('keeps one row when the same item_id was sold at two different unit prices', () => {
      insertOrder({ id: 1, status: 'paid', totalHalalas: 2300, documentId: 'INV-1' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 100,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      insertOrder({ id: 2, status: 'paid', totalHalalas: 5000, documentId: 'INV-2' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 5000,
        createdAt: D.startUnix + 200,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2500,
        qty: 2,
        totalHalalas: 5000,
      });

      const result = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].qtySold).toBe(3);
      expect(result.rows[0].grossHalalas).toBe(7300);
      expect(result.rows[0].netQty).toBe(3);
    });

    it('groups item_id NULL lines by snapshot name under Uncategorized and shows the current catalog name for live items', () => {
      insertItem(2, 1, 'Old Burger', 2300);
      insertOrder({ id: 1, status: 'paid', totalHalalas: 1000, documentId: 'INV-1' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 1000,
        createdAt: D.startUnix + 100,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: null,
        itemName: 'Discontinued Salad',
        unitPriceHalalas: 1000,
        qty: 1,
        totalHalalas: 1000,
      });
      insertOrder({ id: 2, status: 'paid', totalHalalas: 2300, documentId: 'INV-2' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 200,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 2,
        itemName: 'Old Burger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      sqlite.exec(`UPDATE items SET name = 'New Burger' WHERE id = 2`);

      const result = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(2);
      // Burgers (sort 0) sorts before Uncategorized (MAX_SAFE_INTEGER).
      expect(result.rows[0]).toMatchObject({
        itemId: 2,
        itemName: 'New Burger',
        categoryId: 1,
        categoryName: 'Burgers',
        qtySold: 1,
      });
      expect(result.rows[1]).toMatchObject({
        itemId: null,
        itemName: 'Discontinued Salad',
        categoryId: null,
        categoryName: 'Uncategorized',
        qtySold: 1,
        grossHalalas: 1000,
      });
    });

    it('posts refunds to their own service day and nets against the sold item', () => {
      insertOrder({ id: 1, status: 'refunded', totalHalalas: 4600, documentId: 'INV-1' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 4600,
        createdAt: D.startUnix + 100,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 2,
        totalHalalas: 4600,
      });
      insertRefund({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        subtotalHalalas: 4000,
        vatHalalas: 600,
        totalHalalas: 4600,
        documentId: 'REF-1',
        createdAt: D2.startUnix + 50, // D+2
      });
      insertRefundItem({
        id: 1,
        refundId: 1,
        orderItemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 2,
        totalHalalas: 4600,
      });

      // Range D: sold, no refund.
      const onlyD = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20' });
      expect(onlyD.rows).toHaveLength(1);
      expect(onlyD.rows[0].qtySold).toBe(2);
      expect(onlyD.rows[0].grossHalalas).toBe(4600);
      expect(onlyD.rows[0].refundedQty).toBe(0);
      expect(onlyD.rows[0].netQty).toBe(2);
      expect(onlyD.rows[0].netHalalas).toBe(4600);
      expect(onlyD.rows[0].vatHalalas).toBe(600);

      // Range D+2: only the refund (item stays visible at negative net).
      const onlyD2 = service.getItemWiseSales({ from: '2026-08-22', to: '2026-08-22' });
      expect(onlyD2.rows).toHaveLength(1);
      expect(onlyD2.rows[0].qtySold).toBe(0);
      expect(onlyD2.rows[0].refundedQty).toBe(2);
      expect(onlyD2.rows[0].refundedHalalas).toBe(4600);
      expect(onlyD2.rows[0].netQty).toBe(-2);
      expect(onlyD2.rows[0].netHalalas).toBe(-4600);
      expect(onlyD2.rows[0].vatHalalas).toBe(-600);

      // Range covering both: fully refunded item remains visible at net 0.
      const both = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-22' });
      expect(both.rows).toHaveLength(1);
      expect(both.rows[0]).toMatchObject({
        qtySold: 2,
        grossHalalas: 4600,
        refundedQty: 2,
        refundedHalalas: 4600,
        netQty: 0,
        netHalalas: 0,
        vatHalalas: 0,
      });
    });

    it('filters by type on the parent order, excluding takeaway refunds too', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        type: 'dine_in',
        totalHalalas: 2300,
        documentId: 'INV-A',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 10,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      insertOrder({
        id: 2,
        status: 'paid',
        type: 'takeaway',
        totalHalalas: 2000,
        documentId: 'INV-B',
      });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 2000,
        createdAt: D.startUnix + 20,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2000,
        qty: 1,
        totalHalalas: 2000,
      });
      insertOrder({
        id: 3,
        status: 'refunded',
        type: 'takeaway',
        totalHalalas: 3000,
        documentId: 'INV-C',
      });
      insertPayment({
        id: 3,
        orderId: 3,
        methodId: 'cash',
        amountHalalas: 3000,
        createdAt: D.startUnix + 30,
      });
      insertOrderItem({
        id: 3,
        orderId: 3,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 3000,
        qty: 1,
        totalHalalas: 3000,
      });
      insertRefund({
        id: 1,
        orderId: 3,
        methodId: 'cash',
        subtotalHalalas: 3000,
        vatHalalas: 0,
        totalHalalas: 3000,
        documentId: 'REF-C',
        createdAt: D.startUnix + 40,
      });
      insertRefundItem({
        id: 1,
        refundId: 1,
        orderItemId: 3,
        itemName: 'Zinger',
        unitPriceHalalas: 3000,
        qty: 1,
        totalHalalas: 3000,
      });

      const result = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        type: 'dine_in',
      });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].qtySold).toBe(1);
      expect(result.rows[0].grossHalalas).toBe(2300);
      expect(result.rows[0].refundedQty).toBe(0);
    });

    it('filters by partner: none for walk-ins, slug for exact partner', () => {
      insertOrder({
        id: 1,
        status: 'paid',
        type: 'takeaway',
        totalHalalas: 2300,
        documentId: 'INV-P1',
        deliveryPartnerId: 'hungerstation',
      });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'hungerstation',
        amountHalalas: 2300,
        createdAt: D.startUnix + 10,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      insertOrder({
        id: 2,
        status: 'paid',
        type: 'takeaway',
        totalHalalas: 4600,
        documentId: 'INV-P2',
        deliveryPartnerId: null,
      });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 4600,
        createdAt: D.startUnix + 20,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 2,
        totalHalalas: 4600,
      });

      const walkIns = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        partner: 'none',
      });
      expect(walkIns.rows).toHaveLength(1);
      expect(walkIns.rows[0].qtySold).toBe(2);

      const hungerstation = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        partner: 'hungerstation',
      });
      expect(hungerstation.rows).toHaveLength(1);
      expect(hungerstation.rows[0].qtySold).toBe(1);

      const unknown = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        partner: 'keeta',
      });
      expect(unknown.rows).toHaveLength(0);
      expect(unknown.footer.netQty).toBe(0);
    });

    it('filters by category: none for Uncategorized, numeric id for a category', () => {
      insertCategory(2, 'Drinks', 1);
      insertItem(3, 2, 'Cola', 500);
      insertOrder({ id: 1, status: 'paid', totalHalalas: 2300, documentId: 'INV-1' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 10,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      insertOrder({ id: 2, status: 'paid', totalHalalas: 500, documentId: 'INV-2' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 500,
        createdAt: D.startUnix + 20,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 3,
        itemName: 'Cola',
        unitPriceHalalas: 500,
        qty: 1,
        totalHalalas: 500,
      });
      insertOrder({ id: 3, status: 'paid', totalHalalas: 1000, documentId: 'INV-3' });
      insertPayment({
        id: 3,
        orderId: 3,
        methodId: 'cash',
        amountHalalas: 1000,
        createdAt: D.startUnix + 30,
      });
      insertOrderItem({
        id: 3,
        orderId: 3,
        itemId: null,
        itemName: 'Discontinued Salad',
        unitPriceHalalas: 1000,
        qty: 1,
        totalHalalas: 1000,
      });

      const uncategorized = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        category: 'none',
      });
      expect(uncategorized.rows).toHaveLength(1);
      expect(uncategorized.rows[0].itemName).toBe('Discontinued Salad');
      expect(uncategorized.rows[0].categoryId).toBeNull();

      const burgers = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        category: '1',
      });
      expect(burgers.rows).toHaveLength(1);
      expect(burgers.rows[0].itemId).toBe(1);

      const drinks = service.getItemWiseSales({
        from: '2026-08-20',
        to: '2026-08-20',
        category: '2',
      });
      expect(drinks.rows).toHaveLength(1);
      expect(drinks.rows[0].itemId).toBe(3);
    });

    it('ignores open/voided orders and kitchen-removed lines (gone from order_items)', () => {
      insertOrder({ id: 1, status: 'open', totalHalalas: 1000, documentId: 'INV-OPEN' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 1000,
        createdAt: D.startUnix + 10,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 1000,
        qty: 1,
        totalHalalas: 1000,
      });
      insertOrder({ id: 2, status: 'voided', totalHalalas: 2000, documentId: 'INV-VOID' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 2000,
        createdAt: D.startUnix + 20,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2000,
        qty: 1,
        totalHalalas: 2000,
      });
      insertOrder({ id: 3, status: 'paid', totalHalalas: 3000, documentId: 'INV-PAID' });
      insertPayment({
        id: 3,
        orderId: 3,
        methodId: 'cash',
        amountHalalas: 3000,
        createdAt: D.startUnix + 30,
      });
      insertOrderItem({
        id: 3,
        orderId: 3,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 3000,
        qty: 1,
        totalHalalas: 3000,
      });
      // Kitchen-removed line: only an event remains, no order_items row.
      sqlite.exec(
        `INSERT INTO order_events (id, order_id, event_idx, user_id, type, payload, prev_hash, hash, created_at)
         VALUES (1, 3, 0, 1, 'item_removed', '{"orderItemId": 99, "itemId": 1, "qty": 2, "oldQty": 2}', '', '', ${now})`,
      );

      const result = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].qtySold).toBe(1);
      expect(result.rows[0].grossHalalas).toBe(3000);
    });

    it('computes the footer as the sum of the rows', () => {
      insertCategory(2, 'Drinks', 1);
      insertItem(3, 2, 'Cola', 500);
      insertOrder({ id: 1, status: 'paid', totalHalalas: 2300, documentId: 'INV-1' });
      insertPayment({
        id: 1,
        orderId: 1,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 100,
      });
      insertOrderItem({
        id: 1,
        orderId: 1,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      insertOrder({ id: 2, status: 'paid', totalHalalas: 1000, documentId: 'INV-2' });
      insertPayment({
        id: 2,
        orderId: 2,
        methodId: 'cash',
        amountHalalas: 1000,
        createdAt: D.startUnix + 200,
      });
      insertOrderItem({
        id: 2,
        orderId: 2,
        itemId: 3,
        itemName: 'Cola',
        unitPriceHalalas: 500,
        qty: 2,
        totalHalalas: 1000,
      });
      insertOrder({ id: 3, status: 'refunded', totalHalalas: 2300, documentId: 'INV-3' });
      insertPayment({
        id: 3,
        orderId: 3,
        methodId: 'cash',
        amountHalalas: 2300,
        createdAt: D.startUnix + 300,
      });
      insertOrderItem({
        id: 3,
        orderId: 3,
        itemId: 1,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });
      insertRefund({
        id: 1,
        orderId: 3,
        methodId: 'cash',
        subtotalHalalas: 2000,
        vatHalalas: 300,
        totalHalalas: 2300,
        documentId: 'REF-1',
        createdAt: D.startUnix + 400,
      });
      insertRefundItem({
        id: 1,
        refundId: 1,
        orderItemId: 3,
        itemName: 'Zinger',
        unitPriceHalalas: 2300,
        qty: 1,
        totalHalalas: 2300,
      });

      const result = service.getItemWiseSales({ from: '2026-08-20', to: '2026-08-20' });
      expect(result.rows).toHaveLength(2);
      const expected = result.rows.reduce(
        (acc, r) => ({
          qtySold: acc.qtySold + r.qtySold,
          grossHalalas: acc.grossHalalas + r.grossHalalas,
          refundedQty: acc.refundedQty + r.refundedQty,
          refundedHalalas: acc.refundedHalalas + r.refundedHalalas,
          netQty: acc.netQty + r.netQty,
          netHalalas: acc.netHalalas + r.netHalalas,
          vatHalalas: acc.vatHalalas + r.vatHalalas,
        }),
        {
          qtySold: 0,
          grossHalalas: 0,
          refundedQty: 0,
          refundedHalalas: 0,
          netQty: 0,
          netHalalas: 0,
          vatHalalas: 0,
        },
      );
      expect(result.footer).toEqual(expected);
      // Spot-check the actual numbers (not just row-sums). The refunded
      // order's own line still counts as sold (payment posted in range).
      expect(result.footer).toMatchObject({
        qtySold: 4,
        grossHalalas: 5600,
        refundedQty: 1,
        refundedHalalas: 2300,
        netQty: 3,
        netHalalas: 3300,
      });
    });
  });
});
