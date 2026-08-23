/**
 * bake/collect — x_report / z_report formats Unit Tests
 *
 * Runs against a real SQLite DB (migrations applied):
 *  - x_report: current open day × active receipt printers; --day-opening-id
 *    hard-fails when missing or closed; --all is a soft no-op
 *  - z_report: default most-recent closed day; --all widens; --day-opening-id
 *    hard-fails when missing or still open
 *  - --order / --refund / --kick-drawer rejected on both
 *  - --day-opening-id rejected on other formats
 *  - buffers come from buildXReportBuffer / buildZReportBuffer
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { collectPrintJobs, BakeFilterError } from './collect';
import type { PrintDocumentsDb } from '../print-documents';

const NOW = 1_700_000_000;

function insertId(sqlite: Database.Database, sql: string): number {
  sqlite.exec(sql);
  return (sqlite.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
}

describe('collectPrintJobs — x_report / z_report', () => {
  let sqlite: Database.Database;
  let db: PrintDocumentsDb;
  let openDayId: number;
  let closedDayOldId: number;
  let closedDayNewId: number;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db') as {
      findMigrationsDir: () => string;
      applyMigrations: (db: Database.Database, dir: string) => void;
    };
    applyMigrations(sqlite, findMigrationsDir());

    sqlite.exec(`
      INSERT INTO user_roles (id, name, created_at, updated_at)
      VALUES (1, 'admin', ${NOW}, ${NOW});
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, 1, ${NOW}, ${NOW});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES
        ('cash', 'Cash', 1, 0, '10', ${NOW}, ${NOW}),
        ('hungerstation', 'HungerStation', 1, 3, '30', ${NOW}, ${NOW}),
        ('keeta', 'Keeta', 1, 4, '30', ${NOW}, ${NOW});
      INSERT INTO printers (id, name, connection_type, windows_printer_name, ip, port, role, is_active, created_at, updated_at)
      VALUES
        (1, 'Counter A', 'tcp', NULL, '192.168.1.50', 9100, 'receipt', 1, ${NOW}, ${NOW}),
        (2, 'Counter B', 'windows', 'Epson Counter B', '', 9100, 'receipt', 1, ${NOW}, ${NOW}),
        (3, 'Counter Inactive', 'tcp', NULL, '192.168.1.52', 9100, 'receipt', 0, ${NOW}, ${NOW}),
        (4, 'Kitchen', 'tcp', NULL, '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW});
      INSERT INTO settings (key, value) VALUES ('restaurant_name', 'SpicyHome');
    `);

    closedDayOldId = insertId(
      sqlite,
      `
      INSERT INTO day_openings (
        business_date, status, opening_cash_halalas, opened_at, opened_by,
        closed_at, closed_by, closing_cash_halalas, created_at, updated_at
      ) VALUES ('2026-08-20', 'closed', 10000, ${NOW}, 1, ${NOW}, 1, 10000, ${NOW}, ${NOW})
    `,
    );
    closedDayNewId = insertId(
      sqlite,
      `
      INSERT INTO day_openings (
        business_date, status, opening_cash_halalas, opened_at, opened_by,
        closed_at, closed_by, closing_cash_halalas, created_at, updated_at
      ) VALUES ('2026-08-21', 'closed', 20000, ${NOW}, 1, ${NOW}, 1, 25000, ${NOW}, ${NOW})
    `,
    );
    openDayId = insertId(
      sqlite,
      `
      INSERT INTO day_openings (
        business_date, status, opening_cash_halalas, opened_at, opened_by, created_at, updated_at
      ) VALUES ('2026-08-22', 'open', 50000, ${NOW}, 1, ${NOW}, ${NOW})
    `,
    );

    sqlite.exec(`
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
      VALUES (1, 'z-old', 'dine_in', ${closedDayOldId}, 'paid', 1000, 150, 1150, ${NOW}, ${NOW});
      INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
      VALUES (last_insert_rowid(), 'cash', 'Cash', '10', 1150, ${NOW});
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
      VALUES (2, 'z-new-hs', 'takeaway', ${closedDayNewId}, 'paid', 2000, 300, 2300, ${NOW}, ${NOW});
      INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
      VALUES (last_insert_rowid(), 'hungerstation', 'HungerStation', '30', 2300, ${NOW});
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, created_at, updated_at)
      VALUES (3, 'x-open', 'dine_in', ${openDayId}, 'paid', 4000, 600, 4600, ${NOW}, ${NOW});
      INSERT INTO order_payments (order_id, method_id, method_title, zatca_payment_means_code, amount_halalas, created_at)
      VALUES (last_insert_rowid(), 'keeta', 'Keeta', '30', 4600, ${NOW});
    `);

    db = drizzle(sqlite, { schema });
  });

  afterAll(() => {
    sqlite.close();
  });

  describe('x_report', () => {
    it('defaults to the open day × every active receipt printer', () => {
      const result = collectPrintJobs(db, 'x_report', {});
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs.map((j) => j.printer.printerName).sort()).toEqual([
        'Counter A',
        'Counter B',
      ]);
      expect(result.jobs.every((j) => j.format === 'x_report')).toBe(true);
      expect(result.jobs.every((j) => j.sourceId === openDayId)).toBe(true);
      expect(result.jobs.every((j) => j.label === 'X-2026-08-22')).toBe(true);
      const text = result.jobs[0].buffer.toString('ascii');
      expect(text).toContain('X-REPORT');
      expect(text).toContain('SALES BY PAYMENT METHOD');
      expect(text).toContain('Keeta');
      expect(text).toContain('46.00');
      expect(text).not.toContain('HungerStation');
      expect(text).not.toContain('Closing Cash');
    });

    it('accepts --day-opening-id of the open day', () => {
      const result = collectPrintJobs(db, 'x_report', { dayOpeningIds: [openDayId] });
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].sourceId).toBe(openDayId);
    });

    it('hard-fails --day-opening-id when the day is closed', () => {
      expect(() => collectPrintJobs(db, 'x_report', { dayOpeningIds: [closedDayNewId] })).toThrow(
        BakeFilterError,
      );
      expect(() => collectPrintJobs(db, 'x_report', { dayOpeningIds: [closedDayNewId] })).toThrow(
        `Day ${closedDayNewId}: not open (status 'closed')`,
      );
    });

    it('hard-fails --day-opening-id when the day is missing', () => {
      expect(() => collectPrintJobs(db, 'x_report', { dayOpeningIds: [999] })).toThrow(
        'Day 999: not found',
      );
    });

    it('treats --all as a soft no-op', () => {
      const result = collectPrintJobs(db, 'x_report', { all: true });
      expect(result.jobs).toHaveLength(2);
      expect(result.notes.some((n) => n.includes('--all ignored for x_report'))).toBe(true);
    });

    it('restricts to --printer and rejects kitchen-role printers', () => {
      const result = collectPrintJobs(db, 'x_report', { printerIds: [1] });
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].printer.printerName).toBe('Counter A');
      expect(() => collectPrintJobs(db, 'x_report', { printerIds: [4] })).toThrow(
        "Printer 4: role 'kitchen' is not 'receipt'",
      );
    });
  });

  describe('z_report', () => {
    it('defaults to the most recent closed day × every active receipt printer', () => {
      const result = collectPrintJobs(db, 'z_report', {});
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs.every((j) => j.sourceId === closedDayNewId)).toBe(true);
      expect(result.jobs.every((j) => j.label === 'Z-2026-08-21')).toBe(true);
      const text = result.jobs[0].buffer.toString('ascii');
      expect(text).toContain('Z-REPORT');
      expect(text).toContain('Closing Cash');
      expect(text).toContain('SALES BY PAYMENT METHOD');
      expect(text).toContain('HungerStation');
      expect(text).toContain('23.00');
      expect(text).not.toContain('Keeta');
    });

    it('bakes an explicit --day-opening-id', () => {
      const result = collectPrintJobs(db, 'z_report', { dayOpeningIds: [closedDayOldId] });
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs.every((j) => j.sourceId === closedDayOldId)).toBe(true);
      expect(result.jobs.every((j) => j.label === 'Z-2026-08-20')).toBe(true);
    });

    it('--all widens to every closed day', () => {
      const result = collectPrintJobs(db, 'z_report', { all: true });
      const sourceIds = [...new Set(result.jobs.map((j) => j.sourceId))].sort();
      expect(sourceIds).toEqual([closedDayOldId, closedDayNewId]);
      expect(result.jobs).toHaveLength(4);
    });

    it('hard-fails --day-opening-id when the day is still open', () => {
      expect(() => collectPrintJobs(db, 'z_report', { dayOpeningIds: [openDayId] })).toThrow(
        `Day ${openDayId}: not closed (status 'open')`,
      );
    });

    it('hard-fails --day-opening-id when the day is missing', () => {
      expect(() => collectPrintJobs(db, 'z_report', { dayOpeningIds: [999] })).toThrow(
        'Day 999: not found',
      );
    });
  });

  describe('invalid filters', () => {
    it('rejects --order / --refund / --kick-drawer on both report formats', () => {
      expect(() => collectPrintJobs(db, 'x_report', { orderIds: [1] })).toThrow(
        "--order is not valid for format 'x_report'",
      );
      expect(() => collectPrintJobs(db, 'z_report', { refundIds: [1] })).toThrow(
        "--refund is not valid for format 'z_report'",
      );
      expect(() => collectPrintJobs(db, 'z_report', { kickDrawer: true })).toThrow(
        "--kick-drawer is not valid for format 'z_report'",
      );
    });

    it('rejects --day-opening-id on other formats', () => {
      expect(() => collectPrintJobs(db, 'kitchen', { dayOpeningIds: [openDayId] })).toThrow(
        "--day-opening-id is not valid for format 'kitchen'",
      );
      expect(() => collectPrintJobs(db, 'receipt', { dayOpeningIds: [openDayId] })).toThrow(
        "--day-opening-id is not valid for format 'receipt'",
      );
      expect(() => collectPrintJobs(db, 'test', { dayOpeningIds: [openDayId] })).toThrow(
        "--day-opening-id is not valid for format 'test'",
      );
    });
  });
});
