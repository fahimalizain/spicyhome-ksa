import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { PrintersService } from './printers.service';
import { FakePrinterTransport } from './printer-transport';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PrintersService — config CRUD', () => {
  let sqlite: any;
  let db: any;
  let service: PrintersService;
  let now: number;
  const userId = 1;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    // Seed tables: user_roles, users, printers
    now = Math.floor(Date.now() / 1000);

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

      INSERT INTO user_roles (id, name, created_at, updated_at)
      VALUES (1, 'admin', ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    service = new PrintersService(db);
    service.setTransport(new FakePrinterTransport());
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── 1. create without config → defaults ───────────────────────────────────────

  it('create without config returns defaults', () => {
    const printer = service.create(
      { name: 'Kitchen', ip: '192.168.1.100', role: 'kitchen' },
      userId,
    );

    expect(printer.name).toBe('Kitchen');
    expect(printer.ip).toBe('192.168.1.100');
    expect(printer.port).toBe(9100);
    expect(printer.role).toBe('kitchen');
    expect(printer.isActive).toBe(true);

    // config defaults
    expect(printer.config).toEqual({
      arabic: {
        encoding: 'none',
        codePage: 0,
        visualRtl: false,
        renderMode: 'charset',
      },
    });
  });

  it('create with undefined config returns defaults', () => {
    const printer = service.create(
      { name: 'Receipt', ip: '192.168.1.50', role: 'receipt', config: undefined },
      userId,
    );

    expect(printer.config).toEqual({
      arabic: {
        encoding: 'none',
        codePage: 0,
        visualRtl: false,
        renderMode: 'charset',
      },
    });
  });

  // ── 2. create with full config → get returns same ─────────────────────────────

  it('create with full config and get returns same', () => {
    const config = {
      arabic: {
        encoding: 'pc864' as const,
        codePage: 22,
        visualRtl: true,
        renderMode: 'charset',
      },
    };

    const created = service.create(
      {
        name: 'Kitchen RTL',
        ip: '192.168.1.101',
        role: 'kitchen',
        config,
      },
      userId,
    );

    expect(created.config).toEqual(config);

    // get via service returns identical config
    const fetched = service.get(created.id);
    expect(fetched.config).toEqual(config);
  });

  it('create with w1256 encoding persists correctly', () => {
    const config = {
      arabic: {
        encoding: 'w1256' as const,
        codePage: 50,
        visualRtl: false,
        renderMode: 'charset',
      },
    };

    const created = service.create(
      {
        name: 'Cold Station',
        ip: '192.168.1.102',
        role: 'kitchen',
        config,
      },
      userId,
    );

    expect(created.config).toEqual(config);

    const fetched = service.get(created.id);
    expect(fetched.config).toEqual(config);
  });

  it('list includes config on all printers', () => {
    service.create({ name: 'A', ip: '192.168.1.1', role: 'kitchen' }, userId);

    const config = {
      arabic: {
        encoding: 'utf8' as const,
        codePage: 128,
        visualRtl: true,
        renderMode: 'charset',
      },
    };
    service.create({ name: 'B', ip: '192.168.1.2', role: 'receipt', config }, userId);

    const printers = service.list();
    expect(printers).toHaveLength(2);

    // First printer has defaults
    expect(printers[0].config).toEqual({
      arabic: { encoding: 'none', codePage: 0, visualRtl: false, renderMode: 'charset' },
    });
    // Second printer has custom config
    expect(printers[1].config).toEqual(config);
  });

  // ── 3. update config replaces stored config ────────────────────────────────────

  it('update config replaces stored config', () => {
    const created = service.create(
      { name: 'Kitchen', ip: '192.168.1.100', role: 'kitchen' },
      userId,
    );

    // Verify initial defaults
    expect(created.config).toEqual({
      arabic: { encoding: 'none', codePage: 0, visualRtl: false, renderMode: 'charset' },
    });

    const newConfig = {
      arabic: {
        encoding: 'pc864' as const,
        codePage: 22,
        visualRtl: true,
        renderMode: 'charset',
      },
    };

    const updated = service.update(created.id, { config: newConfig }, userId);
    expect(updated.config).toEqual(newConfig);

    // Verify persisted via fresh get
    const fetched = service.get(created.id);
    expect(fetched.config).toEqual(newConfig);
  });

  it('update config back to defaults', () => {
    const rtlConfig = {
      arabic: {
        encoding: 'pc864' as const,
        codePage: 22,
        visualRtl: true,
        renderMode: 'charset',
      },
    };
    const created = service.create(
      { name: 'Printer', ip: '192.168.1.200', role: 'kitchen', config: rtlConfig },
      userId,
    );
    expect(created.config).toEqual(rtlConfig);

    const defaultConfig = {
      arabic: {
        encoding: 'none' as const,
        codePage: 0,
        visualRtl: false,
        renderMode: 'charset',
      },
    };

    const updated = service.update(created.id, { config: defaultConfig }, userId);
    expect(updated.config).toEqual(defaultConfig);
  });

  it('update non-config fields leaves config intact', () => {
    const config = {
      arabic: {
        encoding: 'utf8' as const,
        codePage: 100,
        visualRtl: false,
        renderMode: 'charset',
      },
    };

    const created = service.create(
      { name: 'Printer', ip: '192.168.1.200', role: 'kitchen', config },
      userId,
    );

    // Update only name — config should be preserved
    const updated = service.update(created.id, { name: 'Renamed' }, userId);
    expect(updated.name).toBe('Renamed');
    expect(updated.config).toEqual(config);
  });

  // ── 4. invalid encoding throws BadRequestException ─────────────────────────────

  it('create with invalid encoding throws BadRequestException', () => {
    expect(() =>
      service.create(
        {
          name: 'Bad Printer',
          ip: '192.168.1.1',
          role: 'kitchen',
          config: {
            arabic: {
              encoding: 'invalid_encoding',
              codePage: 0,
              visualRtl: false,
              renderMode: 'charset',
            },
          },
        },
        userId,
      ),
    ).toThrow(BadRequestException);
  });

  it('update with invalid encoding throws BadRequestException', () => {
    const created = service.create({ name: 'Printer', ip: '192.168.1.1', role: 'kitchen' }, userId);

    expect(() =>
      service.update(
        created.id,
        {
          config: {
            arabic: {
              encoding: 'not-real',
              codePage: 0,
              visualRtl: false,
              renderMode: 'charset',
            },
          },
        },
        userId,
      ),
    ).toThrow(BadRequestException);
  });

  it('create with invalid codePage (negative) throws BadRequestException', () => {
    expect(() =>
      service.create(
        {
          name: 'Bad Printer',
          ip: '192.168.1.1',
          role: 'kitchen',
          config: {
            arabic: {
              encoding: 'none',
              codePage: -1,
              visualRtl: false,
              renderMode: 'charset',
            },
          },
        },
        userId,
      ),
    ).toThrow(BadRequestException);
  });

  it('create with invalid codePage (>255) throws BadRequestException', () => {
    expect(() =>
      service.create(
        {
          name: 'Bad Printer',
          ip: '192.168.1.1',
          role: 'kitchen',
          config: {
            arabic: {
              encoding: 'none',
              codePage: 256,
              visualRtl: false,
              renderMode: 'charset',
            },
          },
        },
        userId,
      ),
    ).toThrow(BadRequestException);
  });

  it('create with empty config object {} resolves to defaults via Zod', () => {
    // Zod defaults fill in the missing arabic sub-object.
    // This matches the controller behaviour: class-validator requires
    // the full shape at the API layer, but the service layer is lenient
    // for internal callers / DB reads.
    const printer = service.create(
      {
        name: 'Minimal',
        ip: '192.168.1.1',
        role: 'kitchen',
        config: {},
      },
      userId,
    );

    expect(printer.config).toEqual({
      arabic: {
        encoding: 'none',
        codePage: 0,
        visualRtl: false,
        renderMode: 'charset',
      },
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it('get nonexistent printer throws NotFoundException', () => {
    expect(() => service.get(9999)).toThrow(NotFoundException);
  });

  it('update nonexistent printer throws NotFoundException', () => {
    expect(() => service.update(9999, { name: 'X' }, userId)).toThrow(NotFoundException);
  });

  it('create with explicit isActive: false', () => {
    const printer = service.create(
      {
        name: 'Inactive',
        ip: '192.168.1.99',
        role: 'kitchen',
        isActive: false,
      },
      userId,
    );

    expect(printer.isActive).toBe(false);

    const fetched = service.get(printer.id);
    expect(fetched.isActive).toBe(false);
  });

  it('create with explicit port', () => {
    const printer = service.create(
      {
        name: 'Custom Port',
        ip: '192.168.1.100',
        port: 9300,
        role: 'receipt',
      },
      userId,
    );

    expect(printer.port).toBe(9300);
  });

  // ── listActiveByRole (TEMPORARY kitchen fan-out) ─────────────────────────────

  it('listActiveByRole returns all active printers for a role, excluding inactive ones', () => {
    service.create({ name: 'Kitchen A', ip: '192.168.1.11', role: 'kitchen' }, userId);
    service.create({ name: 'Kitchen B', ip: '192.168.1.12', role: 'kitchen' }, userId);
    service.create(
      { name: 'Kitchen Off', ip: '192.168.1.13', role: 'kitchen', isActive: false },
      userId,
    );
    service.create({ name: 'Counter', ip: '192.168.1.50', role: 'receipt' }, userId);

    const kitchen = service.listActiveByRole('kitchen');
    expect(kitchen.map((p) => p.name).sort()).toEqual(['Kitchen A', 'Kitchen B']);
  });

  it('listActiveByRole returns an empty array when no active printer matches', () => {
    expect(service.listActiveByRole('kitchen')).toEqual([]);
  });
});
