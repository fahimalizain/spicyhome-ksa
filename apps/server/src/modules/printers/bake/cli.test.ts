/**
 * bake/cli — Unit Tests
 *
 * - parseBakeProbeCliArgs: required --format, unknown flags, bad numbers
 * - bakePrintProbeCli: kitchen happy path writes the emit script; empty bakes
 *   and explicit filter hard-fails exit 1 without writing/overwriting;
 *   format-invalid flag combos across all formats map to exit 1
 * - --format test positive path writes the emit script with both active
 *   printers (any role), inactive excluded
 * - resolveBakeDbPath precedence + parseEnvWorktreeContents (ported from the
 *   KOT baker — behavior unchanged)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { bakePrintProbeCli, parseBakeProbeCliArgs } from './cli';
import { parseEnvWorktreeContents, resolveBakeDbPath } from './db-path';

const NOW = 1_700_000_000;

/** File-backed DB with migrations applied. */
function createFileDb(path: string): Database.Database {
  const sqliteFile = new Database(path);
  const { findMigrationsDir, applyMigrations } = require('@spicyhome/db') as {
    findMigrationsDir: () => string;
    applyMigrations: (db: Database.Database, dir: string) => void;
  };
  applyMigrations(sqliteFile, findMigrationsDir());
  return sqliteFile;
}

/** Seed a file DB with one open order (1 item) + one active kitchen printer. */
function seedKitchenDb(dbPath: string): void {
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
}

/** Seed a file DB with an active receipt + active kitchen + inactive printer. */
function seedTestDb(dbPath: string): void {
  const sqliteFile = createFileDb(dbPath);
  sqliteFile.exec(`
    INSERT INTO printers (id, name, ip, port, role, is_active, created_at, updated_at)
    VALUES
      (1, 'Counter A', '192.168.1.50', 9100, 'receipt', 1, ${NOW}, ${NOW}),
      (2, 'Kitchen A', '192.168.1.51', 9100, 'kitchen', 1, ${NOW}, ${NOW}),
      (3, 'Counter Inactive', '192.168.1.52', 9100, 'receipt', 0, ${NOW}, ${NOW});
  `);
  sqliteFile.close();
}

describe('parseBakeProbeCliArgs', () => {
  it('parses a full kitchen invocation', () => {
    const args = parseBakeProbeCliArgs([
      '--format',
      'kitchen',
      '--db',
      'data/x.db',
      '--out',
      'out.js',
      '--order',
      '3',
      '--order',
      '5',
      '--printer',
      '2',
      '--limit',
      '10',
      '--all',
      '--kick-drawer',
    ]);
    expect(args).toEqual({
      format: 'kitchen',
      db: 'data/x.db',
      out: 'out.js',
      orderIds: [3, 5],
      refundIds: [],
      printerIds: [2],
      limit: 10,
      all: true,
      kickDrawer: true,
    });
  });

  it('rejects unknown flags', () => {
    expect(() => parseBakeProbeCliArgs(['--format', 'kitchen', '--bogus'])).toThrow(
      /Unknown argument: --bogus/,
    );
  });

  it('requires --format', () => {
    expect(() => parseBakeProbeCliArgs(['--db', 'x.db'])).toThrow(/Missing required --format/);
  });

  it('rejects an unknown format and lists the valid ones', () => {
    expect(() => parseBakeProbeCliArgs(['--format', 'kot'])).toThrow(
      /Unknown format 'kot'. Valid formats: kitchen, receipt, open_order, credit_note, test/,
    );
  });

  it('rejects non-numeric ids', () => {
    expect(() => parseBakeProbeCliArgs(['--format', 'kitchen', '--order', 'abc'])).toThrow(
      /Invalid value for --order: 'abc' is not a number/,
    );
    expect(() => parseBakeProbeCliArgs(['--format', 'kitchen', '--printer', 'x'])).toThrow(
      /Invalid value for --printer/,
    );
    expect(() => parseBakeProbeCliArgs(['--format', 'kitchen', '--refund', ''])).toThrow(
      /Invalid value for --refund/,
    );
  });

  it('rejects a non-positive --limit', () => {
    expect(() => parseBakeProbeCliArgs(['--format', 'kitchen', '--limit', '0'])).toThrow(
      /--limit: '0' must be a positive integer/,
    );
    expect(() => parseBakeProbeCliArgs(['--format', 'kitchen', '--limit', '-3'])).toThrow(
      /--limit/,
    );
  });
});

describe('bakePrintProbeCli', () => {
  it('exits 1 when --format is missing', () => {
    const code = bakePrintProbeCli(['node', 'bake-print-probe', '--db', 'x.db']);
    expect(code).toBe(1);
  });

  it('bakes a seeded DB, writes the emit script and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'seeded.db');
    seedKitchenDb(dbPath);

    const out = join(dir, 'out', 'send-kitchen.js');
    const code = bakePrintProbeCli([
      'node',
      'bake-print-probe',
      '--format',
      'kitchen',
      '--db',
      dbPath,
      '--out',
      out,
    ]);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const source = readFileSync(out, 'utf8');
    expect(source).toContain("BAKE_FORMAT = 'kitchen';");
    expect(source).toContain('INV26-CLI-1');
    expect(source).toContain('Kitchen A');
    expect(source).toContain('192.168.1.51');
  });

  it('exits 1 and does not overwrite an existing emit script when the bake is empty', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'empty.db');
    createFileDb(dbPath).close();

    const out = join(dir, 'out', 'send-kitchen.js');
    mkdirSync(join(dir, 'out'), { recursive: true });
    writeFileSync(out, 'PREVIOUS GOOD SCRIPT');
    const code = bakePrintProbeCli([
      'node',
      'bake-print-probe',
      '--format',
      'kitchen',
      '--db',
      dbPath,
      '--out',
      out,
    ]);
    expect(code).toBe(1);
    expect(readFileSync(out, 'utf8')).toBe('PREVIOUS GOOD SCRIPT');
  });

  it('exits 1 and does not write when an explicit bad order is given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'bad-order.db');
    seedKitchenDb(dbPath); // order id 1 is open; 999 does not exist

    const out = join(dir, 'out', 'send-kitchen.js');
    const code = bakePrintProbeCli([
      'node',
      'bake-print-probe',
      '--format',
      'kitchen',
      '--db',
      dbPath,
      '--order',
      '999',
      '--out',
      out,
    ]);
    expect(code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it('exits 1 without writing when --refund is passed for kitchen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'refund.db');
    seedKitchenDb(dbPath);

    const out = join(dir, 'out', 'send-kitchen.js');
    const code = bakePrintProbeCli([
      'node',
      'bake-print-probe',
      '--format',
      'kitchen',
      '--db',
      dbPath,
      '--refund',
      '1',
      '--out',
      out,
    ]);
    expect(code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it('exits 1 without writing for every format-invalid flag combo', () => {
    // Collectors throw BakeFilterError for these; the CLI must map them to
    // exit 1 and never write/overwrite the emit script.
    const combos: Array<[string, string[]]> = [
      ['kitchen', ['--kick-drawer']],
      ['open_order', ['--refund', '1']],
      ['open_order', ['--kick-drawer']],
      ['receipt', ['--refund', '1']],
      ['test', ['--order', '1']],
      ['test', ['--refund', '1']],
      ['test', ['--kick-drawer']],
    ];
    for (const [format, flags] of combos) {
      const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
      const dbPath = join(dir, `${format}.db`);
      createFileDb(dbPath).close(); // filter errors throw before any data is read

      const out = join(dir, 'out', `send-${format}.js`);
      const code = bakePrintProbeCli([
        'node',
        'bake-print-probe',
        '--format',
        format,
        '--db',
        dbPath,
        ...flags,
        '--out',
        out,
      ]);
      expect(code).toBe(1);
      expect(existsSync(out)).toBe(false);
    }
  });

  it('surfaces the BakeFilterError message on stderr for test --order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'test-order.db');
    createFileDb(dbPath).close();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const code = bakePrintProbeCli([
        'node',
        'bake-print-probe',
        '--format',
        'test',
        '--db',
        dbPath,
        '--order',
        '1',
      ]);
      expect(code).toBe(1);
      const stderr = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(stderr).toContain("--order is not valid for format 'test'");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('bakes --format test, writes the emit script and exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'test.db');
    seedTestDb(dbPath); // 2 active printers (receipt + kitchen), 1 inactive

    const out = join(dir, 'out', 'send-test.js');
    const code = bakePrintProbeCli([
      'node',
      'bake-print-probe',
      '--format',
      'test',
      '--db',
      dbPath,
      '--out',
      out,
    ]);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const source = readFileSync(out, 'utf8');
    expect(source).toContain("BAKE_FORMAT = 'test';");
    // Both active printers baked (any role); inactive excluded.
    expect(source).toContain('Counter A');
    expect(source).toContain('Kitchen A');
    expect(source).not.toContain('Counter Inactive');
  });

  it('exits 1 without writing when --format test has no active printers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bake-print-probe-cli-'));
    const dbPath = join(dir, 'empty.db');
    createFileDb(dbPath).close();

    const out = join(dir, 'out', 'send-test.js');
    const code = bakePrintProbeCli([
      'node',
      'bake-print-probe',
      '--format',
      'test',
      '--db',
      dbPath,
      '--out',
      out,
    ]);
    expect(code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
});

describe('resolveBakeDbPath', () => {
  it('defaults to ./data/spicyhome.db resolved against cwd', () => {
    expect(resolveBakeDbPath({ env: {}, cwd: '/repo' })).toBe('/repo/data/spicyhome.db');
  });

  it('resolves the default against BUILD_WORKSPACE_DIRECTORY when set', () => {
    expect(resolveBakeDbPath({ env: { BUILD_WORKSPACE_DIRECTORY: '/ws' }, cwd: '/sandbox' })).toBe(
      '/ws/data/spicyhome.db',
    );
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
    expect(parseEnvWorktreeContents('PORT=123\nSPICYHOME_DB="./data/x.db"\n')).toBe('./data/x.db');
    expect(parseEnvWorktreeContents('SPICYHOME_DB=  \n')).toBeUndefined();
  });
});
