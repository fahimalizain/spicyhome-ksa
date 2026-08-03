/**
 * bake-open-kots — Unit Tests
 *
 * Tests the open-orders KOT baker against a real SQLite DB (migrations
 * applied, same pattern as print-job.service.test.ts):
 *  - collectOpenKotJobs: fan-out math, skips, header resolution, ESC/POS bytes
 *  - buildEmitScriptSource: embedded base64 payload round-trip, parseability
 *  - writeEmitScript, resolveBakeDbPath precedence, CLI exit behavior
 */
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import {
  bakeOpenKotsCli,
  buildEmitScriptSource,
  collectOpenKotJobs,
  parseEnvWorktreeContents,
  resolveBakeDbPath,
  writeEmitScript,
  type BakeDb,
} from './bake-open-kots';

const NOW = 1_700_000_000;

/** Run a SQL statement and return the last inserted row id. */
function insertId(sqlite: Database.Database, sql: string): number {
  sqlite.exec(sql);
  return (sqlite.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
}

describe('bake-open-kots', () => {
  let sqlite: Database.Database;
  let db: BakeDb;

  let orderWithItemsId: number;
  let orderDeliveryId: number;
  let orderFallbackId: number;
  let orderEmptyId: number;
  let orderPaidId: number;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db') as {
      findMigrationsDir: () => string;
      applyMigrations: (db: Database.Database, dir: string) => void;
    };
    applyMigrations(sqlite, findMigrationsDir());

    seedDatabase();
    db = drizzle(sqlite, { schema });
  });

  afterAll(() => {
    sqlite.close();
  });

  function seedDatabase(): void {
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES (1, 'admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${NOW}, ${NOW});
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Ali Kasim', 1, 1, ${NOW}, ${NOW});
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-07-15', 'open', ${NOW}, 1, ${NOW}, ${NOW});
      INSERT INTO tables (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 'T1', 0, 1, ${NOW}, ${NOW});
      INSERT INTO delivery_partners (id, title, enabled, sort_order, created_at, updated_at)
      VALUES ('hungerstation', 'HungerStation', 1, 0, ${NOW}, ${NOW});
    `);

    // Printers: 2 active kitchen (tcp + windows), 1 inactive kitchen, 1 receipt.
    sqlite.exec(`
      INSERT INTO printers (id, name, connection_type, windows_printer_name, ip, port, role, is_active, created_at, updated_at)
      VALUES
        (1, 'Kitchen A', 'tcp', NULL, '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW}),
        (2, 'Kitchen B', 'windows', 'Epson Kitchen B', '', 9100, 'kitchen', 1, ${NOW}, ${NOW}),
        (3, 'Kitchen Inactive', 'tcp', NULL, '192.168.1.53', 9100, 'kitchen', 0, ${NOW}, ${NOW}),
        (4, 'Counter', 'tcp', NULL, '192.168.1.50', 9100, 'receipt', 1, ${NOW}, ${NOW});
    `);

    // Open order with items (dine-in at T1, created by Ali).
    orderWithItemsId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, notes, created_at, updated_at, created_by)
      VALUES (1001, 'u-open-1', 'dine_in', 1, 1, 'open', 10000, 1500, 11500, 'INV26-0001', 'No onions please', ${NOW}, ${NOW}, 1);
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, notes, created_at, updated_at)
      VALUES (${orderWithItemsId}, 'Zinger Burger', 11500, 1500, 2, 23000, 'no onion', ${NOW}, ${NOW});
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, notes, created_at, updated_at)
      VALUES (${orderWithItemsId}, 'Pepsi', 3000, 1500, 1, 3000, NULL, ${NOW}, ${NOW});
    `);

    // Open takeaway order linked to a delivery partner (ADR 0007).
    orderDeliveryId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, delivery_partner_id, delivery_external_ref, created_at, updated_at, created_by)
      VALUES (1002, 'u-open-2', 'takeaway', NULL, 1, 'open', 10000, 1500, 11500, 'INV26-0002', 'hungerstation', 'HS-883129', ${NOW}, ${NOW}, 1);
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderDeliveryId}, 'Corn Soup', 10000, 1500, 1, 10000, ${NOW}, ${NOW});
    `);

    // Open order with NULL document_id (SQL level allows it) — the baker must
    // fall back to `Order-<orderNo>` like printKitchenTickets.
    orderFallbackId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at, created_by)
      VALUES (1003, 'u-open-3', 'dine_in', 1, 1, 'open', 8000, 1200, 9200, NULL, ${NOW}, ${NOW}, NULL);
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, notes, created_at, updated_at)
      VALUES (${orderFallbackId}, 'Kunafa', 8000, 1500, 1, 8000, 'extra cheese', ${NOW}, ${NOW});
    `);

    // Open order with NO items — must be skipped.
    orderEmptyId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
      VALUES (1004, 'u-open-empty', 'takeaway', NULL, 1, 'open', 0, 0, 0, 'INV26-0004', ${NOW}, ${NOW});
    `,
    );

    // Paid order with items — must be ignored.
    orderPaidId = insertId(
      sqlite,
      `
      INSERT INTO orders (order_no, uuid, type, table_id, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
      VALUES (1005, 'u-paid', 'dine_in', 1, 1, 'paid', 10000, 1500, 11500, 'INV26-0005', ${NOW}, ${NOW});
    `,
    );
    sqlite.exec(`
      INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
      VALUES (${orderPaidId}, 'Paid Burger', 11500, 1500, 1, 11500, ${NOW}, ${NOW});
    `);
  }

  // ── collectOpenKotJobs ─────────────────────────────────────────────────────

  describe('collectOpenKotJobs', () => {
    it('produces one job per (open order with items x active kitchen printer)', () => {
      const result = collectOpenKotJobs(db);
      expect(result.jobs).toHaveLength(6); // 3 orders with items x 2 printers
      expect(result.openOrderCount).toBe(4); // includes the empty order
      expect(result.kitchenPrinterCount).toBe(2);
      expect(result.skippedEmptyOrderIds).toEqual([orderEmptyId]);

      const combos = result.jobs.map((j) => `${j.orderId}:${j.printer.printerId}`).sort();
      expect(combos).toEqual(
        [
          `${orderWithItemsId}:1`,
          `${orderWithItemsId}:2`,
          `${orderDeliveryId}:1`,
          `${orderDeliveryId}:2`,
          `${orderFallbackId}:1`,
          `${orderFallbackId}:2`,
        ].sort(),
      );
    });

    it('ignores paid orders and inactive / non-kitchen printers', () => {
      const result = collectOpenKotJobs(db);
      const orderIds = new Set(result.jobs.map((j) => j.orderId));
      const printerIds = new Set(result.jobs.map((j) => j.printer.printerId));
      expect(orderIds.has(orderPaidId)).toBe(false);
      expect(printerIds.has(3)).toBe(false); // inactive kitchen printer
      expect(printerIds.has(4)).toBe(false); // receipt-role printer
      expect(printerIds).toEqual(new Set([1, 2]));
    });

    it('skips open orders without items', () => {
      const result = collectOpenKotJobs(db);
      expect(result.skippedEmptyOrderIds).toContain(orderEmptyId);
      expect(result.jobs.some((j) => j.orderId === orderEmptyId)).toBe(false);
    });

    it('bakes a valid ESC/POS ticket with documentId, items and printer header', () => {
      const result = collectOpenKotJobs(db);
      const job = result.jobs.find(
        (j) => j.orderId === orderWithItemsId && j.printer.printerId === 1,
      )!;
      // ESC @ init
      expect(job.buffer[0]).toBe(0x1b);
      expect(job.buffer[1]).toBe(0x40);
      const ascii = job.buffer.toString('ascii');
      expect(ascii).toContain('INV26-0001');
      expect(ascii).toContain('Zinger Burger');
      expect(ascii).toContain('Pepsi');
      expect(ascii).toContain('Printer: Kitchen A');
      expect(ascii).toContain('TABLE T1');
      expect(ascii).toContain('Created By: Ali Kasim');
      expect(ascii).toContain('NOTES: No onions please');
      expect(ascii).toContain('Qty: 2x');
      // Target fields match the printers row
      expect(job.printer.printerName).toBe('Kitchen A');
      expect(job.printer.connectionType).toBe('tcp');
      expect(job.printer.ip).toBe('192.168.1.51');
      expect(job.printer.port).toBe(9100);
    });

    it('names each printer station in its own ticket header', () => {
      const result = collectOpenKotJobs(db);
      const a = result.jobs.find(
        (j) => j.orderId === orderWithItemsId && j.printer.printerId === 1,
      )!;
      const b = result.jobs.find(
        (j) => j.orderId === orderWithItemsId && j.printer.printerId === 2,
      )!;
      expect(a.buffer.toString('ascii')).toContain('Printer: Kitchen A');
      expect(b.buffer.toString('ascii')).toContain('Printer: Kitchen B');
      expect(a.buffer.equals(b.buffer)).toBe(false);
    });

    it('falls back to Order-<orderNo> when document_id is missing', () => {
      const result = collectOpenKotJobs(db);
      const job = result.jobs.find((j) => j.orderId === orderFallbackId)!;
      expect(job.documentId).toBe(`Order-1003`);
      expect(job.buffer.toString('ascii')).toContain('Order-1003');
    });

    it('resolves delivery partner title and external ref (ADR 0007)', () => {
      const result = collectOpenKotJobs(db);
      const job = result.jobs.find((j) => j.orderId === orderDeliveryId)!;
      const ascii = job.buffer.toString('ascii');
      expect(ascii).toContain('Delivery: HungerStation');
      expect(ascii).toContain('App order #: HS-883129');
      expect(ascii).toContain('Type: Takeaway');
    });

    it('carries the Windows queue name on windows targets', () => {
      const result = collectOpenKotJobs(db);
      const job = result.jobs.find((j) => j.printer.printerId === 2)!;
      expect(job.printer.connectionType).toBe('windows');
      expect(job.printer.windowsPrinterName).toBe('Epson Kitchen B');
    });

    it('returns zero jobs for a DB with no open orders', () => {
      const { findMigrationsDir, createTestDb } = require('@spicyhome/db') as {
        findMigrationsDir: () => string;
        createTestDb: (dir: string) => Database.Database;
      };
      const emptySqlite = createTestDb(findMigrationsDir());
      const edb: BakeDb = drizzle(emptySqlite, { schema });
      try {
        const result = collectOpenKotJobs(edb);
        expect(result.jobs).toEqual([]);
        expect(result.openOrderCount).toBe(0);
        expect(result.skippedEmptyOrderIds).toEqual([]);
        expect(result.kitchenPrinterCount).toBe(0);
      } finally {
        emptySqlite.close();
      }
    });
  });

  // ── buildEmitScriptSource ──────────────────────────────────────────────────

  describe('buildEmitScriptSource', () => {
    it('embeds base64 buffers + printer targets and round-trips the payload', () => {
      const result = collectOpenKotJobs(db);
      const source = buildEmitScriptSource(result.jobs);

      expect(source).toContain('Generated by bake-open-kots');
      expect(source).toContain('Requires Node 18');
      expect(source).toContain('PAPER STORM WARNING');
      expect(source).toContain("require('net')");
      expect(source).toContain('192.168.1.51'); // tcp target ip
      expect(source).toContain('9100'); // tcp target port
      expect(source).toContain('Epson Kitchen B'); // windows queue name
      expect(source).toContain('INV26-0001'); // documentId in plan log

      const match = source.match(/JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
      expect(match).not.toBeNull();
      const decoded = match![1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const payload = JSON.parse(decoded) as Array<{
        orderId: number;
        documentId: string;
        bufferB64: string;
        printer: {
          printerName: string;
          connectionType: string;
          ip: string;
          port: number;
          windowsPrinterName: string | null;
        };
      }>;
      expect(payload).toHaveLength(result.jobs.length);
      for (let i = 0; i < payload.length; i++) {
        expect(Buffer.from(payload[i].bufferB64, 'base64').equals(result.jobs[i].buffer)).toBe(
          true,
        );
      }
    });

    it('is parseable as plain JavaScript without executing the print path', () => {
      const result = collectOpenKotJobs(db);
      const source = buildEmitScriptSource(result.jobs);
      expect(() => {
        new Function(source);
      }).not.toThrow();
    });
  });

  // ── writeEmitScript ────────────────────────────────────────────────────────

  describe('writeEmitScript', () => {
    it('writes the source, creating parent directories on demand', () => {
      const dir = mkdtempSync(join(tmpdir(), 'bake-open-kots-'));
      const out = join(dir, 'nested', 'out', 'send-open-kots.js');
      const source = buildEmitScriptSource(collectOpenKotJobs(db).jobs);
      writeEmitScript(out, source);
      expect(readFileSync(out, 'utf8')).toBe(source);
    });
  });

  // ── resolveBakeDbPath ──────────────────────────────────────────────────────

  describe('resolveBakeDbPath', () => {
    it('defaults to ./data/spicyhome.db resolved against cwd', () => {
      expect(resolveBakeDbPath({ env: {}, cwd: '/repo' })).toBe('/repo/data/spicyhome.db');
    });

    it('resolves the default against BUILD_WORKSPACE_DIRECTORY when set', () => {
      expect(
        resolveBakeDbPath({ env: { BUILD_WORKSPACE_DIRECTORY: '/ws' }, cwd: '/sandbox' }),
      ).toBe('/ws/data/spicyhome.db');
    });

    it('lets SPICYHOME_DB env beat .env.worktree and the default', () => {
      expect(
        resolveBakeDbPath({
          env: { SPICYHOME_DB: './data/live.db' },
          cwd: '/repo',
          envWorktreeContents: 'SPICYHOME_DB=./data/wrong.db',
        }),
      ).toBe('/repo/data/live.db');
    });

    it('lets the --db flag beat SPICYHOME_DB env', () => {
      expect(
        resolveBakeDbPath({
          dbFlag: '/abs/live.db',
          env: { SPICYHOME_DB: './data/env.db' },
          cwd: '/repo',
        }),
      ).toBe('/abs/live.db');
    });

    it('reads SPICYHOME_DB from .env.worktree contents when env is unset', () => {
      expect(
        resolveBakeDbPath({
          env: {},
          cwd: '/repo',
          envWorktreeContents:
            '# worktree bootstrap\nPORT=3743\nSPICYHOME_DB=./data/spicyhome-kot.db\n',
        }),
      ).toBe('/repo/data/spicyhome-kot.db');
    });

    it('parseEnvWorktreeContents ignores comments and unrelated keys', () => {
      expect(parseEnvWorktreeContents('# comment\nPORT=123\n')).toBeUndefined();
      expect(parseEnvWorktreeContents('PORT=123\nSPICYHOME_DB="./data/x.db"\n')).toBe(
        './data/x.db',
      );
      expect(parseEnvWorktreeContents('SPICYHOME_DB=  \n')).toBeUndefined();
    });
  });

  // ── CLI ────────────────────────────────────────────────────────────────────

  describe('bakeOpenKotsCli', () => {
    function createFileDb(path: string): Database.Database {
      const sqliteFile = new Database(path);
      const { findMigrationsDir, applyMigrations } = require('@spicyhome/db') as {
        findMigrationsDir: () => string;
        applyMigrations: (db: Database.Database, dir: string) => void;
      };
      applyMigrations(sqliteFile, findMigrationsDir());
      return sqliteFile;
    }

    it('exits 1 and does not write the emit script when there is nothing to bake', () => {
      const dir = mkdtempSync(join(tmpdir(), 'bake-open-kots-cli-'));
      const dbPath = join(dir, 'empty.db');
      createFileDb(dbPath).close();

      const out = join(dir, 'out', 'send-open-kots.js');
      const code = bakeOpenKotsCli(['node', 'bake-open-kots', '--db', dbPath, '--out', out]);
      expect(code).toBe(1);
      expect(existsSync(out)).toBe(false);
    });

    it('bakes a seeded DB, writes the emit script and exits 0', () => {
      const dir = mkdtempSync(join(tmpdir(), 'bake-open-kots-cli-'));
      const dbPath = join(dir, 'seeded.db');
      const sqliteFile = createFileDb(dbPath);
      sqliteFile.exec(`
        INSERT INTO user_roles (id, name, created_at, updated_at)
        VALUES (1, 'admin', ${NOW}, ${NOW});
        INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
        VALUES (1, 'cli-admin', 'x', 'CLI Admin', 1, 1, ${NOW}, ${NOW});
        INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
        VALUES ('2024-07-15', 'open', ${NOW}, 1, ${NOW}, ${NOW});
        INSERT INTO printers (name, ip, port, role, is_active, created_at, updated_at)
        VALUES ('Kitchen A', '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW});
        INSERT INTO orders (order_no, uuid, type, day_opening_id, status, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at, updated_at)
        VALUES (9001, 'cli-open-1', 'dine_in', 1, 'open', 10000, 1500, 11500, 'INV26-CLI-1', ${NOW}, ${NOW});
        INSERT INTO order_items (order_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
        VALUES (1, 'Kabsa', 11500, 1500, 1, 11500, ${NOW}, ${NOW});
      `);
      sqliteFile.close();

      const out = join(dir, 'out', 'send-open-kots.js');
      const code = bakeOpenKotsCli(['node', 'bake-open-kots', '--db', dbPath, '--out', out]);
      expect(code).toBe(0);
      expect(existsSync(out)).toBe(true);
      const source = readFileSync(out, 'utf8');
      expect(source).toContain('INV26-CLI-1');
      expect(source).toContain('Kitchen A');
      expect(source).toContain('192.168.1.51');
    });
  });
});
