import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { settings } from '@spicyhome/db';
import { eq } from 'drizzle-orm';

describe('Daily Order Sequence', () => {
  let sqlite: any;
  let db: any;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db = drizzle(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  function getNextOrderNo(tx: any, now: number): number {
    const today = new Date(now * 1000).toISOString().slice(0, 10);
    const row = tx.select().from(settings).where(eq(settings.key, 'daily_order_seq')).get();
    if (!row) {
      tx.insert(settings)
        .values({ key: 'daily_order_seq', value: `${today}:1` })
        .run();
      return 1;
    }
    const [storedDate, storedSeqStr] = row.value.split(':');
    const storedSeq = parseInt(storedSeqStr, 10);
    if (storedDate === today) {
      const newSeq = storedSeq + 1;
      tx.update(settings)
        .set({ value: `${today}:${newSeq}` })
        .where(eq(settings.key, 'daily_order_seq'))
        .run();
      return newSeq;
    } else {
      tx.update(settings)
        .set({ value: `${today}:1` })
        .where(eq(settings.key, 'daily_order_seq'))
        .run();
      return 1;
    }
  }

  it('returns 1 for the first ever order', () => {
    const txn = db;
    const seq = getNextOrderNo(txn, 1000);
    expect(seq).toBe(1);
  });

  it('increments for subsequent orders on the same day', () => {
    const txn = db;
    expect(getNextOrderNo(txn, 1000)).toBe(1);
    expect(getNextOrderNo(txn, 1000)).toBe(2);
    expect(getNextOrderNo(txn, 1000)).toBe(3);
  });

  it('resets when date changes', () => {
    const txn = db;
    expect(getNextOrderNo(txn, 1000)).toBe(1);
    expect(getNextOrderNo(txn, 1000)).toBe(2);

    const nextDay = 1000 + 86400;
    expect(getNextOrderNo(txn, nextDay)).toBe(1);
  });

  it('continues from stored sequence after reset', () => {
    const txn = db;
    expect(getNextOrderNo(txn, 1000)).toBe(1);
    expect(getNextOrderNo(txn, 1000)).toBe(2);

    const nextDay = 1000 + 86400;
    expect(getNextOrderNo(txn, nextDay)).toBe(1);
    expect(getNextOrderNo(txn, nextDay)).toBe(2);
  });
});
