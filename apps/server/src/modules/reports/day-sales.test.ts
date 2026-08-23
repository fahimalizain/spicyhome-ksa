import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { loadDayCategorySales, loadDayKitchenCancelled } from './day-sales';

describe('day-sales', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let eventIdx: number;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`
      CREATE TABLE item_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        printer_id INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        subcategory_id INTEGER,
        name TEXT NOT NULL,
        price_halalas INTEGER NOT NULL,
        vat_rate_bp INTEGER NOT NULL DEFAULT 1500,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_id INTEGER,
        item_name TEXT NOT NULL,
        unit_price_halalas INTEGER NOT NULL,
        vat_rate_bp INTEGER NOT NULL,
        qty INTEGER NOT NULL,
        total_halalas INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE order_events (
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
    `);
    db = drizzle(sqlite, { schema });
    eventIdx = 0;

    sqlite.exec(`
      INSERT INTO item_categories (id, name, sort_order, created_at, updated_at)
      VALUES (1, 'Breads', 0, 1, 1), (2, 'Mains', 1, 1, 1);
      INSERT INTO items (id, category_id, name, price_halalas, created_at, updated_at)
      VALUES (10, 1, 'Butter Naan', 500, 1, 1), (20, 2, 'Butter Chicken', 2500, 1, 1);
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertRemaining(opts: {
    id: number;
    orderId: number;
    itemId: number | null;
    qty: number;
    unitPriceHalalas: number;
  }) {
    sqlite
      .prepare(
        `INSERT INTO order_items
          (id, order_id, item_id, item_name, unit_price_halalas, vat_rate_bp, qty, total_halalas, created_at, updated_at)
         VALUES (?, ?, ?, 'x', ?, 1500, ?, ?, 1, 1)`,
      )
      .run(
        opts.id,
        opts.orderId,
        opts.itemId,
        opts.unitPriceHalalas,
        opts.qty,
        opts.qty * opts.unitPriceHalalas,
      );
  }

  function insertEvent(orderId: number, type: string, payload: Record<string, unknown>) {
    eventIdx += 1;
    sqlite
      .prepare(
        `INSERT INTO order_events (order_id, event_idx, user_id, type, payload, created_at)
         VALUES (?, ?, 1, ?, ?, 1)`,
      )
      .run(orderId, eventIdx, type, JSON.stringify(payload));
  }

  describe('loadDayCategorySales', () => {
    it('returns [] for no paid orders', () => {
      expect(loadDayCategorySales(db, [])).toEqual([]);
    });

    it('rolls remaining lines up by category', () => {
      insertRemaining({ id: 1, orderId: 100, itemId: 10, qty: 2, unitPriceHalalas: 500 });
      insertRemaining({ id: 2, orderId: 100, itemId: 20, qty: 1, unitPriceHalalas: 2500 });

      expect(loadDayCategorySales(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 2, totalHalalas: 1000 },
        { categoryId: 2, categoryName: 'Mains', itemCount: 1, totalHalalas: 2500 },
      ]);
    });
  });

  describe('loadDayKitchenCancelled', () => {
    it('returns [] for no paid orders', () => {
      expect(loadDayKitchenCancelled(db, [])).toEqual([]);
    });

    it('ignores removals that were never sent to kitchen', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 3,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'item_removed', {
        orderItemId: 1,
        itemName: 'Butter Naan',
        oldQty: 3,
        oldTotal: 1500,
      });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([]);
    });

    it('counts a full remove after kitchen print', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 5,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 1, itemName: 'Butter Naan', printedQty: 5 }],
      });
      insertEvent(100, 'item_removed', {
        orderItemId: 1,
        itemName: 'Butter Naan',
        oldQty: 5,
        oldTotal: 2500,
      });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 5, totalHalalas: 2500 },
      ]);
    });

    it('counts only the printed surplus when qty is reduced', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 8,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 1, itemName: 'Butter Naan', printedQty: 8 }],
      });
      insertEvent(100, 'item_updated', {
        orderItemId: 1,
        itemName: 'Butter Naan',
        oldQty: 8,
        newQty: 3,
        oldTotal: 4000,
        newTotal: 1500,
        kitchenPrintedQty: 0,
      });
      insertRemaining({ id: 1, orderId: 100, itemId: 10, qty: 3, unitPriceHalalas: 500 });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 5, totalHalalas: 2500 },
      ]);
    });

    it('does not count unprinted extras that were later removed', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 5,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 1, itemName: 'Butter Naan', printedQty: 5 }],
      });
      insertEvent(100, 'item_updated', {
        orderItemId: 1,
        oldQty: 5,
        newQty: 8,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'item_removed', {
        orderItemId: 1,
        itemName: 'Butter Naan',
        oldQty: 8,
        oldTotal: 4000,
      });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 5, totalHalalas: 2500 },
      ]);
    });

    it('uses enqueued printedQty over legacy item kitchenPrintedQty', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 5,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 5,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 1, itemName: 'Butter Naan', printedQty: 5 }],
      });
      insertEvent(100, 'item_removed', { orderItemId: 1, oldQty: 5, oldTotal: 2500 });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 5, totalHalalas: 2500 },
      ]);
    });

    it('falls back to legacy kitchenPrintedQty when nothing was enqueued', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 4,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 4,
      });
      insertEvent(100, 'item_removed', { orderItemId: 1, oldQty: 4, oldTotal: 2000 });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 4, totalHalalas: 2000 },
      ]);
    });

    it('uses the overridden unit price for a removed line', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 2,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 1, printedQty: 2 }],
      });
      insertEvent(100, 'item_price_overridden', {
        orderItemId: 1,
        itemId: 10,
        fromUnitPriceHalalas: 500,
        toUnitPriceHalalas: 400,
      });
      insertEvent(100, 'item_removed', { orderItemId: 1, oldQty: 2, oldTotal: 800 });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 2, totalHalalas: 800 },
      ]);
    });

    it('rolls cancelled qty across categories and ignores other orders', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 10,
        qty: 3,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'item_added', {
        orderItemId: 2,
        itemId: 20,
        qty: 1,
        unitPriceHalalas: 2500,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [
          { orderItemId: 1, printedQty: 3 },
          { orderItemId: 2, printedQty: 1 },
        ],
      });
      insertEvent(100, 'item_removed', { orderItemId: 1, oldQty: 3, oldTotal: 1500 });
      insertEvent(100, 'item_removed', { orderItemId: 2, oldQty: 1, oldTotal: 2500 });

      insertEvent(200, 'item_added', {
        orderItemId: 9,
        itemId: 10,
        qty: 9,
        unitPriceHalalas: 500,
        kitchenPrintedQty: 0,
      });
      insertEvent(200, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 9, printedQty: 9 }],
      });
      insertEvent(200, 'item_removed', { orderItemId: 9, oldQty: 9, oldTotal: 4500 });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: 1, categoryName: 'Breads', itemCount: 3, totalHalalas: 1500 },
        { categoryId: 2, categoryName: 'Mains', itemCount: 1, totalHalalas: 2500 },
      ]);
    });

    it('lands deleted menu items in Uncategorized', () => {
      insertEvent(100, 'item_added', {
        orderItemId: 1,
        itemId: 99,
        qty: 1,
        unitPriceHalalas: 700,
        kitchenPrintedQty: 0,
      });
      insertEvent(100, 'kitchen_print_enqueued', {
        items: [{ orderItemId: 1, printedQty: 1 }],
      });
      insertEvent(100, 'item_removed', { orderItemId: 1, oldQty: 1, oldTotal: 700 });

      expect(loadDayKitchenCancelled(db, [100])).toEqual([
        { categoryId: null, categoryName: 'Uncategorized', itemCount: 1, totalHalalas: 700 },
      ]);
    });
  });
});
