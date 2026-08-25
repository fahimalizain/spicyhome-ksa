/**
 * bake/collect — test format Unit Tests
 *
 * Runs against a real SQLite DB (migrations applied, same pattern as
 * collect-kitchen.test.ts):
 *  - default: one diagnostic job per active printer (any role), id ascending
 *  - buffers come from buildTestTicketBuffer (shared helper, no drift)
 *  - label 'test', sourceId null (synthetic — no orders/refunds)
 *  - --printer restricts to any role; hard-fails on missing/inactive
 *  - inactive printers excluded from the default set
 *  - --order / --refund / --kick-drawer rejected with BakeFilterError
 *  - --limit caps the first N printers by id ascending; --all is a soft no-op
 *  - empty bake (no active printers) yields jobs [] + an explanatory note
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { collectPrintJobs, BakeFilterError } from './collect';
import type { PrintDocumentsDb } from '../print-documents';

const NOW = 1_700_000_000;

describe('collectPrintJobs — test', () => {
  let sqlite: Database.Database;
  let db: PrintDocumentsDb;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db') as {
      findMigrationsDir: () => string;
      applyMigrations: (db: Database.Database, dir: string) => void;
    };
    applyMigrations(sqlite, findMigrationsDir());

    // Printers: 2 active receipt (tcp + windows), 1 inactive receipt,
    // 1 active kitchen — test tickets target ALL active printers, any role.
    sqlite.exec(`
      INSERT INTO printers (id, name, connection_type, windows_printer_name, ip, port, role, is_active, created_at, updated_at)
      VALUES
        (1, 'Counter A', 'tcp', NULL, '192.168.1.50', 9100, 'receipt', 1, ${NOW}, ${NOW}),
        (2, 'Counter B', 'windows', 'Epson Counter B', '', 9100, 'receipt', 1, ${NOW}, ${NOW}),
        (3, 'Counter Inactive', 'tcp', NULL, '192.168.1.52', 9100, 'receipt', 0, ${NOW}, ${NOW}),
        (4, 'Kitchen', 'tcp', NULL, '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW});
    `);

    db = drizzle(sqlite, { schema });
  });

  afterAll(() => {
    sqlite.close();
  });

  it('bakes one diagnostic job per active printer (any role, id ascending)', () => {
    const result = collectPrintJobs(db, 'test', {});
    expect(result.jobs).toHaveLength(3); // receipt 1, receipt 2, kitchen 4
    expect(result.jobs.map((j) => j.printer.printerId)).toEqual([1, 2, 4]);
    expect(result.jobs.every((j) => j.format === 'test')).toBe(true);
    expect(result.jobs.every((j) => j.label === 'test')).toBe(true);
    expect(result.jobs.every((j) => j.sourceId === null)).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it('bakes a valid ESC/POS diagnostic ticket via buildTestTicketBuffer', () => {
    const result = collectPrintJobs(db, 'test', {});
    const job = result.jobs.find((j) => j.printer.printerId === 1)!;
    // ESC @ init
    expect(job.buffer[0]).toBe(0x1b);
    expect(job.buffer[1]).toBe(0x40);
    const ascii = job.buffer.toString('ascii');
    expect(ascii).toContain('PRINT DIAGNOSTIC');
    expect(ascii).toContain('Printer: Counter A');
    expect(ascii).toContain('IP: 192.168.1.50:9100');
    // Target fields match the printers row
    expect(job.printer.printerName).toBe('Counter A');
    expect(job.printer.connectionType).toBe('tcp');
    expect(job.printer.ip).toBe('192.168.1.50');
    expect(job.printer.port).toBe(9100);
  });

  it('names each printer in its own ticket and carries the Windows queue', () => {
    const result = collectPrintJobs(db, 'test', {});
    const a = result.jobs.find((j) => j.printer.printerId === 1)!;
    const b = result.jobs.find((j) => j.printer.printerId === 2)!;
    expect(a.buffer.toString('ascii')).toContain('Printer: Counter A');
    expect(b.buffer.toString('ascii')).toContain('Printer: Counter B');
    expect(a.buffer.equals(b.buffer)).toBe(false);
    expect(b.printer.connectionType).toBe('windows');
    expect(b.printer.windowsPrinterName).toBe('Epson Counter B');
  });

  it('excludes inactive printers from the default set', () => {
    const printerIds = collectPrintJobs(db, 'test', {}).jobs.map((j) => j.printer.printerId);
    expect(printerIds).not.toContain(3);
  });

  it('printerIds restricts to the given ids and accepts any role', () => {
    const result = collectPrintJobs(db, 'test', { printerIds: [4] }); // kitchen role
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].printer.printerId).toBe(4);
    expect(result.jobs[0].label).toBe('test');
    expect(result.jobs[0].sourceId).toBeNull();
  });

  it('printerIds deduplicates repeated ids', () => {
    const result = collectPrintJobs(db, 'test', { printerIds: [1, 1, 2] });
    expect(result.jobs.map((j) => j.printer.printerId)).toEqual([1, 2]);
  });

  it('printerIds hard-fails on a missing printer', () => {
    expect(() => collectPrintJobs(db, 'test', { printerIds: [999] })).toThrow(BakeFilterError);
    expect(() => collectPrintJobs(db, 'test', { printerIds: [999] })).toThrow(
      /Printer 999: not found/,
    );
  });

  it('printerIds hard-fails on an inactive printer', () => {
    expect(() => collectPrintJobs(db, 'test', { printerIds: [3] })).toThrow(/Printer 3: inactive/);
  });

  it('limit caps the printers to the first N by id ascending', () => {
    const result = collectPrintJobs(db, 'test', { limit: 2 });
    expect(result.jobs.map((j) => j.printer.printerId)).toEqual([1, 2]);
  });

  it('limit sorts explicit printer ids by id ascending before truncating', () => {
    // Explicit: kitchen (higher id) first, limit 1 → the lower id wins.
    const result = collectPrintJobs(db, 'test', { printerIds: [4, 1], limit: 1 });
    expect(result.jobs.map((j) => j.printer.printerId)).toEqual([1]);
  });

  it('all is a soft no-op for test', () => {
    const baseline = collectPrintJobs(db, 'test', {});
    const withAll = collectPrintJobs(db, 'test', { all: true });
    expect(withAll.jobs.map((j) => j.printer.printerId)).toEqual(
      baseline.jobs.map((j) => j.printer.printerId),
    );
    expect(withAll.jobs.map((j) => j.format)).toEqual(baseline.jobs.map((j) => j.format));
    expect(withAll.jobs.map((j) => j.label)).toEqual(baseline.jobs.map((j) => j.label));
    expect(withAll.jobs.map((j) => j.sourceId)).toEqual(baseline.jobs.map((j) => j.sourceId));
    expect(withAll.notes).toContain(
      '--all ignored for test: all active printers are included by default',
    );
  });

  it('orderIds is invalid for test', () => {
    expect(() => collectPrintJobs(db, 'test', { orderIds: [1] })).toThrow(
      /--order is not valid for format 'test'/,
    );
  });

  it('refundIds is invalid for test', () => {
    expect(() => collectPrintJobs(db, 'test', { refundIds: [1] })).toThrow(
      /--refund is not valid for format 'test'/,
    );
  });

  it('kickDrawer is invalid for test', () => {
    expect(() => collectPrintJobs(db, 'test', { kickDrawer: true })).toThrow(
      /--kick-drawer is not valid for format 'test'/,
    );
  });

  it('returns empty jobs with a note when no active printers exist', () => {
    const { createTestDb, findMigrationsDir } = require('@spicyhome/db') as {
      createTestDb: (dir: string) => Database.Database;
      findMigrationsDir: () => string;
    };
    const emptySqlite = createTestDb(findMigrationsDir());
    const edb: PrintDocumentsDb = drizzle(emptySqlite, { schema });
    try {
      const result = collectPrintJobs(edb, 'test', {});
      expect(result.jobs).toEqual([]);
      expect(result.notes).toContain('no active printers — no jobs to bake');
    } finally {
      emptySqlite.close();
    }
  });
});
