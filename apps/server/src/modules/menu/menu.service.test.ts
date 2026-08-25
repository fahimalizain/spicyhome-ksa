import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { WS_EVENTS } from '@spicyhome/shared';
import { NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';

describe('MenuService — realtime item events', () => {
  let sqlite: any;
  let db: any;
  let service: MenuService;
  let emitter: { emit: jest.Mock };
  let now: number;
  const userId = 1;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    now = Math.floor(Date.now() / 1000);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS item_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        printer_id INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
      CREATE TABLE IF NOT EXISTS item_subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES item_categories(id),
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES item_categories(id),
        subcategory_id INTEGER NOT NULL REFERENCES item_subcategories(id),
        name TEXT NOT NULL,
        name_ar TEXT,
        price_halalas INTEGER NOT NULL,
        vat_rate_bp INTEGER NOT NULL DEFAULT 1500,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );

      INSERT INTO item_categories (id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 'Main', 0, 1, ${now}, ${now});
      INSERT INTO item_subcategories (id, category_id, name, sort_order, is_active, created_at, updated_at)
      VALUES (1, 1, 'Starters', 0, 1, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    emitter = { emit: jest.fn() };
    service = new MenuService(db, emitter as any);
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── 1. createItem emits item.created ──────────────────────────────────────────

  it('createItem emits item.created with itemId and userId', () => {
    const item = service.createItem(
      { name: 'Kabsa', subcategoryId: 1, priceHalalas: 3500 },
      userId,
    );

    expect(item.name).toBe('Kabsa');
    expect(typeof item.id).toBe('number');

    expect(emitter.emit).toHaveBeenCalledWith(WS_EVENTS.ITEM_CREATED, {
      itemId: item.id,
      userId,
    });
  });

  // ── 2. updateItem with isActive: false emits item.updated and persists ───────

  it('updateItem with isActive false emits item.updated and persists isActive false', () => {
    const created = service.createItem(
      { name: 'Kabsa', subcategoryId: 1, priceHalalas: 3500 },
      userId,
    );

    const updated = service.updateItem(created.id, { isActive: false }, userId);

    expect(updated.isActive).toBe(false);
    expect(emitter.emit).toHaveBeenCalledWith(WS_EVENTS.ITEM_UPDATED, {
      itemId: created.id,
      userId,
    });

    // Persisted via fresh read
    const fetched = service.getItem(created.id);
    expect(fetched.isActive).toBe(false);
  });

  // ── 3. emit failure is swallowed ──────────────────────────────────────────────

  it('emit failure is swallowed and the mutation still succeeds', () => {
    const created = service.createItem(
      { name: 'Kabsa', subcategoryId: 1, priceHalalas: 3500 },
      userId,
    );

    emitter.emit = jest.fn(() => {
      throw new Error('event emitter down');
    });

    let updated: any;
    expect(() => {
      updated = service.updateItem(created.id, { name: 'Mandi' }, userId);
    }).not.toThrow();

    expect(updated.name).toBe('Mandi');

    // Mutation persisted despite the emit failure
    const fetched = service.getItem(created.id);
    expect(fetched.name).toBe('Mandi');
  });

  // ── 4. not-found update throws and does not emit ─────────────────────────────

  it('updateItem on a missing item throws NotFoundException and does not emit', () => {
    expect(() => service.updateItem(9999, { name: 'Ghost' }, userId)).toThrow(NotFoundException);
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
