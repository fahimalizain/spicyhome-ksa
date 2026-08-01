import { OrderEventsService } from './order-events.service';
import { orderEvents } from '@spicyhome/db';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

describe('OrderEventsService', () => {
  let db: any;
  let sqlite: any;
  let service: OrderEventsService;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no INTEGER NOT NULL,
        uuid TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        table_id INTEGER,
        day_opening_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        subtotal_halalas INTEGER DEFAULT 0 NOT NULL,
        vat_halalas INTEGER DEFAULT 0 NOT NULL,
        total_halalas INTEGER DEFAULT 0 NOT NULL,
        discount_halalas INTEGER DEFAULT 0 NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER,
        updated_by INTEGER
      );
      CREATE TABLE order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        event_idx INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    db = drizzle(sqlite);
    service = new OrderEventsService();
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertOrder(id: number, uuidSuffix: string = '1') {
    sqlite
      .prepare(
        `INSERT INTO orders (id, order_no, uuid, type, day_opening_id, status, created_at, updated_at)
       VALUES (?, 1, 'uuid-${uuidSuffix}', 'dine_in', 1, 'open', 1000, 1000)`,
      )
      .run(id);
  }

  describe('hash chain', () => {
    it('computes first hash with empty prev_hash', () => {
      insertOrder(1);
      const txn = db;

      const result = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      expect(result.prevHash).toBe('');
      expect(result.eventIdx).toBe(1);
      expect(result.hash.length).toBe(64);

      const entry = txn.select().from(orderEvents).where(eq(orderEvents.orderId, 1)).get();
      expect(entry!.hash).toBe(result.hash);
      expect(entry!.prevHash).toBe('');
      expect(entry!.hash.length).toBe(64);
    });

    it('eventIdx starts at 1 and increments per order', () => {
      insertOrder(1);
      const txn = db;

      const r1 = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      expect(r1.eventIdx).toBe(1);

      const r2 = service.createEvent(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);
      expect(r2.eventIdx).toBe(2);

      const r3 = service.createEvent(txn, 1, 1, 'item_updated', {}, 1002);
      expect(r3.eventIdx).toBe(3);
    });

    it('chains multiple entries with correct prev_hash', () => {
      insertOrder(1);
      const txn = db;

      const r1 = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      expect(r1.prevHash).toBe('');
      expect(r1.eventIdx).toBe(1);

      const r2 = service.createEvent(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);
      expect(r2.prevHash).toBe(r1.hash);
      expect(r2.eventIdx).toBe(2);

      const r3 = service.createEvent(txn, 1, 1, 'item_updated', {}, 1002);
      expect(r3.prevHash).toBe(r2.hash);
      expect(r3.eventIdx).toBe(3);

      const entries = service.getEvents(txn, 1);
      expect(entries.length).toBe(3);
      expect(entries[0].eventIdx).toBe(1);
      expect(entries[1].eventIdx).toBe(2);
      expect(entries[2].eventIdx).toBe(3);
    });

    it('hash changes when eventIdx changes (same payload, different eventIdx)', () => {
      insertOrder(1);
      const txn = db;

      const r1 = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);

      // Create a second entry with identical payload and timestamp
      const r2 = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);

      // eventIdx differs, so hashes should differ
      expect(r1.hash).not.toBe(r2.hash);
      expect(r1.eventIdx).toBe(1);
      expect(r2.eventIdx).toBe(2);
    });

    it('verifyChain returns valid for a correct chain', () => {
      insertOrder(1);
      const txn = db;

      service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      service.createEvent(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);
      service.createEvent(txn, 1, 1, 'item_updated', {}, 1002);

      const entries = service.getEvents(txn, 1);
      const result = service.verifyChain(1, entries);
      expect(result.valid).toBe(true);
      expect(result.brokenAt).toBeUndefined();
    });

    it('verifyChain detects broken prev_hash and returns brokenAt', () => {
      insertOrder(1);
      const txn = db;

      service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      service.createEvent(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);

      const entries = service.getEvents(txn, 1);
      entries[1].prevHash = 'tampered';
      const result = service.verifyChain(1, entries);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(entries[1].eventIdx);
    });

    it('verifyChain detects tampered hash and returns brokenAt', () => {
      insertOrder(1);
      const txn = db;

      service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      service.createEvent(txn, 1, 1, 'item_added', { itemId: 1 }, 1001);

      const entries = service.getEvents(txn, 1);
      entries[0].hash = 'tampered';
      const result = service.verifyChain(1, entries);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(entries[0].eventIdx);
    });

    it('hash changes with different payload', () => {
      insertOrder(1);
      const txn = db;

      const r1 = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      const r2 = service.createEvent(txn, 1, 1, 'created', { type: 'takeaway' }, 1000);
      expect(r1.hash).not.toBe(r2.hash);
    });

    it('isolates chains per order', () => {
      insertOrder(1, 'a');
      insertOrder(2, 'b');
      const txn = db;

      const r1a = service.createEvent(txn, 1, 1, 'created', { type: 'dine_in' }, 1000);
      const r2a = service.createEvent(txn, 2, 1, 'created', { type: 'takeaway' }, 1000);

      expect(r1a.prevHash).toBe('');
      expect(r2a.prevHash).toBe('');

      const entries1 = service.getEvents(txn, 1);
      const entries2 = service.getEvents(txn, 2);
      expect(entries1.length).toBe(1);
      expect(entries2.length).toBe(1);
    });

    it('prevHash is empty for first event of a new order', () => {
      insertOrder(99);
      const txn = db;
      const result = service.createEvent(txn, 99, 1, 'created', {}, 1000);
      expect(result.prevHash).toBe('');
    });

    it('prevHash returns previous hash for existing entries', () => {
      insertOrder(1);
      const txn = db;
      const r1 = service.createEvent(txn, 1, 1, 'created', {}, 1000);
      const r2 = service.createEvent(txn, 1, 1, 'item_added', {}, 1001);
      expect(r2.prevHash).toBe(r1.hash);
    });
  });

  describe('getPrintedQty', () => {
    it('returns 0 when there are no events', () => {
      const txn = db;
      expect(service.getPrintedQty(txn, 1)).toBe(0);
    });

    it('sums kitchenPrintedQty from item_added events', () => {
      insertOrder(1);
      const txn = db;

      // Simulate writing events directly (bypassing service to set specific payload)
      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 5 }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'item_updated',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 3 }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      expect(service.getPrintedQty(txn, 5)).toBe(8);
    });

    it('filters by orderItemId, ignoring other items', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 5 }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 99, kitchenPrintedQty: 10 }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      // Only item 5's qty should be counted
      expect(service.getPrintedQty(txn, 5)).toBe(5);
      expect(service.getPrintedQty(txn, 99)).toBe(10);
    });

    it('treats missing kitchenPrintedQty as 0', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, itemName: 'Test' }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'item_updated',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 2 }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      // First event has no kitchenPrintedQty, second has 2
      expect(service.getPrintedQty(txn, 5)).toBe(2);
    });

    it('only counts item_added and item_updated events', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 5 }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'item_removed',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 999 }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      // item_removed should not be counted even if it has kitchenPrintedQty
      expect(service.getPrintedQty(txn, 5)).toBe(5);
    });

    it('handles malformed JSON gracefully', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: 'not-valid-json{{{',
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      // Should not throw
      expect(service.getPrintedQty(txn, 5)).toBe(0);
    });

    it('sums printedQty from kitchen_print_enqueued items (ADR 0006)', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [
              { orderItemId: 5, itemName: 'Zinger Burger', printedQty: 5 },
              { orderItemId: 6, itemName: 'Pepsi', printedQty: 2 },
            ],
          }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 5, itemName: 'Zinger Burger', printedQty: 3 }],
          }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      // Only item 5's printedQty from both enqueued events is counted
      expect(service.getPrintedQty(txn, 5)).toBe(8);
      expect(service.getPrintedQty(txn, 6)).toBe(2);
    });

    it('legacy double-write: enqueued is authoritative, does not double-count', () => {
      insertOrder(1);
      const txn = db;

      // Pre-ADR auto-print era: a single kitchen send wrote BOTH an item
      // event with kitchenPrintedQty AND a kitchen_print_enqueued with the
      // same printedQty in the same transaction.
      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 5 }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 5, itemName: 'Zinger Burger', printedQty: 5 }],
          }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1000,
        })
        .run();

      // 5 (enqueued) — NOT 5 + 5 = 10. Enqueued wins over legacy item qty.
      expect(service.getPrintedQty(txn, 5)).toBe(5);
    });

    it('enqueued-only (new ADR path): item events carry 0, multiple sends sum', () => {
      insertOrder(1);
      const txn = db;

      // ADR 0006: item mutations never kitchen-print, kitchenPrintedQty is 0
      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 0 }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 5, itemName: 'Zinger Burger', printedQty: 5 }],
          }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 3,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 5, itemName: 'Zinger Burger', printedQty: 3 }],
          }),
          prevHash: 'dummy2',
          hash: 'dummy3',
          createdAt: 1002,
        })
        .run();

      // 5 + 3 = 8 from enqueued events (item kitchenPrintedQty 0 ignored)
      expect(service.getPrintedQty(txn, 5)).toBe(8);
    });

    it('fan-out enqueue (TEMPORARY): printers[] metadata does not double-count items', () => {
      insertOrder(1);
      const txn = db;

      // One kitchen_print_enqueued per send: qty lives ONLY in top-level
      // items; printers[] lists the fan-out targets (audit/timeline metadata).
      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            items: [{ orderItemId: 5, itemName: 'Zinger Burger', printedQty: 5 }],
            printers: [
              { printerId: 2, printer: 'Kitchen' },
              { printerId: 3, printer: 'Cold Station' },
            ],
            printer: 'Kitchen, Cold Station',
          }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      // Counted exactly once despite the two printer targets
      expect(service.getPrintedQty(txn, 5)).toBe(5);
    });

    it('falls back to item kitchenPrintedQty when no enqueued event mentions the item', () => {
      insertOrder(1);
      const txn = db;

      // Printer-less legacy claim or pure item-only history: only item
      // events exist, no kitchen_print_enqueued for this item.
      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'item_added',
          payload: JSON.stringify({ orderItemId: 5, kitchenPrintedQty: 5 }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      // An enqueued event exists for a DIFFERENT item — must not switch
      // this item to the enqueued source.
      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 2,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 99, itemName: 'Pepsi', printedQty: 7 }],
          }),
          prevHash: 'dummy1',
          hash: 'dummy2',
          createdAt: 1001,
        })
        .run();

      expect(service.getPrintedQty(txn, 5)).toBe(5);
      expect(service.getPrintedQty(txn, 99)).toBe(7);
    });

    it('treats kitchen_print_enqueued without a matching orderItemId as 0', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 99, itemName: 'Pepsi', printedQty: 7 }],
          }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      // No matching orderItemId → 0; the other item still counts its own
      expect(service.getPrintedQty(txn, 5)).toBe(0);
      expect(service.getPrintedQty(txn, 99)).toBe(7);
    });

    it('ignores malformed items arrays in kitchen_print_enqueued payloads', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'kitchen_print_enqueued',
          payload: JSON.stringify({ printer: 'Kitchen', printerId: 2, items: 'not-an-array' }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      expect(service.getPrintedQty(txn, 5)).toBe(0);
    });

    it('does not count kitchen_print_succeeded events', () => {
      insertOrder(1);
      const txn = db;

      txn
        .insert(orderEvents)
        .values({
          orderId: 1,
          eventIdx: 1,
          userId: 1,
          type: 'kitchen_print_succeeded',
          payload: JSON.stringify({
            printer: 'Kitchen',
            printerId: 2,
            items: [{ orderItemId: 5, printedQty: 999 }],
          }),
          prevHash: '',
          hash: 'dummy1',
          createdAt: 1000,
        })
        .run();

      expect(service.getPrintedQty(txn, 5)).toBe(0);
    });
  });
});
