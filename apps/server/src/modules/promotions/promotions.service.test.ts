import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { PromotionsService } from './promotions.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('PromotionsService', () => {
  let sqlite: any;
  let db: any;
  let service: PromotionsService;
  let now: number;

  const nationalDay = {
    name: 'KSA National Day',
    nameAr: 'اليوم الوطني',
    percentBp: 1000,
    startBusinessDate: '2026-09-23',
    endBusinessDate: '2026-09-25',
  };

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
      CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        name_ar TEXT NOT NULL,
        percent_bp INTEGER NOT NULL,
        start_business_date TEXT NOT NULL,
        end_business_date TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id)
      );
    `);

    now = Math.floor(Date.now() / 1000);

    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, created_at, updated_at)
      VALUES (1, 'admin', 1, ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, ${now}, ${now});
    `);

    db = drizzle(sqlite, { schema });
    service = new PromotionsService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('create', () => {
    it('returns booleans, audit fields, enabled true, percentBp as given', () => {
      const promo = service.create(nationalDay, 1);
      expect(promo.id).toBe(1);
      expect(promo.name).toBe('KSA National Day');
      expect(promo.nameAr).toBe('اليوم الوطني');
      expect(promo.percentBp).toBe(1000);
      expect(promo.startBusinessDate).toBe('2026-09-23');
      expect(promo.endBusinessDate).toBe('2026-09-25');
      expect(promo.enabled).toBe(true);
      expect(typeof promo.enabled).toBe('boolean');
      expect(promo.createdBy).toBe(1);
      expect(promo.updatedBy).toBe(1);
      expect(typeof promo.createdAt).toBe('number');
      expect(typeof promo.updatedAt).toBe('number');
    });

    it('trims name and nameAr', () => {
      const promo = service.create(
        { ...nationalDay, name: '  National Day  ', nameAr: '  اليوم  ' },
        1,
      );
      expect(promo.name).toBe('National Day');
      expect(promo.nameAr).toBe('اليوم');
    });

    it('rejects empty/whitespace name after trim (400)', () => {
      expect(() => service.create({ ...nationalDay, name: '   ' }, 1)).toThrow(BadRequestException);
      expect(() => service.create({ ...nationalDay, name: '   ' }, 1)).toThrow(
        'name must not be empty',
      );
    });

    it('rejects empty/whitespace nameAr after trim (400)', () => {
      expect(() => service.create({ ...nationalDay, nameAr: '  ' }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.create({ ...nationalDay, nameAr: '  ' }, 1)).toThrow(
        'nameAr must not be empty',
      );
    });

    it('rejects invalid date format (400)', () => {
      expect(() => service.create({ ...nationalDay, startBusinessDate: 'bogus' }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.create({ ...nationalDay, startBusinessDate: 'bogus' }, 1)).toThrow(
        'Invalid date: bogus (expected YYYY-MM-DD)',
      );
    });

    it('rejects impossible calendar dates (400)', () => {
      expect(() => service.create({ ...nationalDay, startBusinessDate: '2026-02-30' }, 1)).toThrow(
        'Invalid date: 2026-02-30 (expected YYYY-MM-DD)',
      );
      expect(() => service.create({ ...nationalDay, endBusinessDate: '2026-13-01' }, 1)).toThrow(
        'Invalid date: 2026-13-01 (expected YYYY-MM-DD)',
      );
    });

    it('rejects start after end (400)', () => {
      expect(() =>
        service.create(
          {
            ...nationalDay,
            startBusinessDate: '2026-09-25',
            endBusinessDate: '2026-09-23',
          },
          1,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.create(
          {
            ...nationalDay,
            startBusinessDate: '2026-09-25',
            endBusinessDate: '2026-09-23',
          },
          1,
        ),
      ).toThrow('startBusinessDate must not be after endBusinessDate');
    });

    it('rejects percentBp 0 and 10001 (400)', () => {
      expect(() => service.create({ ...nationalDay, percentBp: 0 }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.create({ ...nationalDay, percentBp: 10001 }, 1)).toThrow(
        BadRequestException,
      );
      expect(() => service.create({ ...nationalDay, percentBp: 10001 }, 1)).toThrow(
        'percentBp must be an integer between 1 and 10000',
      );
    });

    it('allows percentBp 1 and 10000', () => {
      const low = service.create(
        {
          ...nationalDay,
          percentBp: 1,
          startBusinessDate: '2026-01-01',
          endBusinessDate: '2026-01-01',
        },
        1,
      );
      expect(low.percentBp).toBe(1);
      const high = service.create(
        {
          ...nationalDay,
          name: 'Max',
          percentBp: 10000,
          startBusinessDate: '2026-02-01',
          endBusinessDate: '2026-02-01',
        },
        1,
      );
      expect(high.percentBp).toBe(10000);
    });

    it('rejects overlapping enabled range on create (409)', () => {
      service.create(nationalDay, 1);
      expect(() =>
        service.create(
          {
            ...nationalDay,
            name: 'Overlap',
            startBusinessDate: '2026-09-24',
            endBusinessDate: '2026-09-26',
          },
          1,
        ),
      ).toThrow(ConflictException);
      expect(() =>
        service.create(
          {
            ...nationalDay,
            name: 'Overlap',
            startBusinessDate: '2026-09-24',
            endBusinessDate: '2026-09-26',
          },
          1,
        ),
      ).toThrow('An enabled promotion "KSA National Day" already covers 2026-09-23–2026-09-25');
    });

    it('allows adjacent ranges (end=22, start=23) without overlap', () => {
      service.create(
        {
          ...nationalDay,
          name: 'Before',
          startBusinessDate: '2026-09-20',
          endBusinessDate: '2026-09-22',
        },
        1,
      );
      const next = service.create(
        {
          ...nationalDay,
          name: 'After',
          startBusinessDate: '2026-09-23',
          endBusinessDate: '2026-09-25',
        },
        1,
      );
      expect(next.name).toBe('After');
      expect(next.enabled).toBe(true);
    });

    it('allows create on dates covered only by a disabled promotion', () => {
      const first = service.create(nationalDay, 1);
      service.update(first.id, { enabled: false }, 1);
      const second = service.create(
        {
          ...nationalDay,
          name: 'Replacement',
          startBusinessDate: '2026-09-23',
          endBusinessDate: '2026-09-25',
        },
        1,
      );
      expect(second.name).toBe('Replacement');
      expect(second.enabled).toBe(true);
    });
  });

  describe('list', () => {
    it('includes disabled and sorts by startBusinessDate DESC then id DESC', () => {
      const a = service.create(
        {
          ...nationalDay,
          name: 'A',
          startBusinessDate: '2026-01-01',
          endBusinessDate: '2026-01-02',
        },
        1,
      );
      // Two rows with the same start date (one disabled so they may share dates)
      const b = service.create(
        {
          ...nationalDay,
          name: 'B',
          startBusinessDate: '2026-03-01',
          endBusinessDate: '2026-03-02',
        },
        1,
      );
      service.update(b.id, { enabled: false }, 1);
      const c = service.create(
        {
          ...nationalDay,
          name: 'C',
          startBusinessDate: '2026-03-01',
          endBusinessDate: '2026-03-03',
        },
        1,
      );
      service.update(a.id, { enabled: false }, 1);

      const rows = service.list();
      expect(rows).toHaveLength(3);
      // Same start 2026-03-01: higher id (C) first, then B; A last (earliest start)
      expect(rows.map((r: any) => r.name)).toEqual(['C', 'B', 'A']);
      expect(rows[1].enabled).toBe(false);
      expect(rows[2].enabled).toBe(false);
      expect(typeof rows[0].enabled).toBe('boolean');
      expect(rows[0].id).toBe(c.id);
      expect(rows[1].id).toBe(b.id);
    });
  });

  describe('update', () => {
    it('throws NotFoundException for unknown id', () => {
      expect(() => service.update(999, { name: 'X' }, 1)).toThrow(NotFoundException);
      expect(() => service.update(999, { name: 'X' }, 1)).toThrow('Promotion not found');
    });

    it('updates name/percent on a live row that does not newly overlap', () => {
      const promo = service.create(nationalDay, 1);
      const updated = service.update(promo.id, { name: 'National Day Sale', percentBp: 1500 }, 1);
      expect(updated.name).toBe('National Day Sale');
      expect(updated.percentBp).toBe(1500);
      expect(updated.enabled).toBe(true);
    });

    it('rejects shift dates onto another enabled row (409)', () => {
      service.create(nationalDay, 1);
      const other = service.create(
        {
          ...nationalDay,
          name: 'Later',
          startBusinessDate: '2026-10-01',
          endBusinessDate: '2026-10-03',
        },
        1,
      );
      expect(() =>
        service.update(
          other.id,
          { startBusinessDate: '2026-09-24', endBusinessDate: '2026-09-26' },
          1,
        ),
      ).toThrow(ConflictException);
      expect(() =>
        service.update(
          other.id,
          { startBusinessDate: '2026-09-24', endBusinessDate: '2026-09-26' },
          1,
        ),
      ).toThrow('An enabled promotion "KSA National Day" already covers 2026-09-23–2026-09-25');
    });

    it('rejects enabling a disabled row that overlaps a live one (409)', () => {
      const live = service.create(nationalDay, 1);
      const disabled = service.create(
        {
          ...nationalDay,
          name: 'Old',
          startBusinessDate: '2026-10-01',
          endBusinessDate: '2026-10-02',
        },
        1,
      );
      service.update(disabled.id, { enabled: false }, 1);
      // Move disabled onto live range while still disabled — OK
      service.update(
        disabled.id,
        { startBusinessDate: '2026-09-23', endBusinessDate: '2026-09-25' },
        1,
      );
      // Enabling would overlap live
      expect(() => service.update(disabled.id, { enabled: true }, 1)).toThrow(ConflictException);
      expect(live.enabled).toBe(true);
    });

    it('allows disabled rows to share dates with an enabled one', () => {
      const live = service.create(nationalDay, 1);
      const other = service.create(
        {
          ...nationalDay,
          name: 'Shadow',
          startBusinessDate: '2026-10-01',
          endBusinessDate: '2026-10-02',
        },
        1,
      );
      service.update(other.id, { enabled: false }, 1);
      const updated = service.update(
        other.id,
        {
          startBusinessDate: '2026-09-23',
          endBusinessDate: '2026-09-25',
        },
        1,
      );
      expect(updated.enabled).toBe(false);
      expect(updated.startBusinessDate).toBe('2026-09-23');
      expect(live.enabled).toBe(true);
    });

    it('soft-disable always works (no open-order guard)', () => {
      const promo = service.create(nationalDay, 1);
      const updated = service.update(promo.id, { enabled: false }, 1);
      expect(updated.enabled).toBe(false);
    });

    it('rejects invalid dates on update (400)', () => {
      const promo = service.create(nationalDay, 1);
      expect(() => service.update(promo.id, { startBusinessDate: '2026-02-30' }, 1)).toThrow(
        'Invalid date: 2026-02-30 (expected YYYY-MM-DD)',
      );
    });

    it('rejects resulting start after end on partial date update (400)', () => {
      const promo = service.create(nationalDay, 1);
      // existing end is 2026-09-25; set start after that
      expect(() => service.update(promo.id, { startBusinessDate: '2026-09-26' }, 1)).toThrow(
        'startBusinessDate must not be after endBusinessDate',
      );
    });

    it('rejects out-of-range percentBp on update (400)', () => {
      const promo = service.create(nationalDay, 1);
      expect(() => service.update(promo.id, { percentBp: 0 }, 1)).toThrow(BadRequestException);
    });

    it('rejects empty name on update (400)', () => {
      const promo = service.create(nationalDay, 1);
      expect(() => service.update(promo.id, { name: '  ' }, 1)).toThrow('name must not be empty');
    });
  });

  describe('findEnabledForBusinessDate', () => {
    it('returns the enabled promotion inside range, on start day, and on end day', () => {
      const promo = service.create(nationalDay, 1);
      expect(service.findEnabledForBusinessDate('2026-09-24').id).toBe(promo.id);
      expect(service.findEnabledForBusinessDate('2026-09-23').id).toBe(promo.id);
      expect(service.findEnabledForBusinessDate('2026-09-25').id).toBe(promo.id);
    });

    it('returns null outside range', () => {
      service.create(nationalDay, 1);
      expect(service.findEnabledForBusinessDate('2026-09-22')).toBeNull();
      expect(service.findEnabledForBusinessDate('2026-09-26')).toBeNull();
    });

    it('skips disabled promotions', () => {
      const promo = service.create(nationalDay, 1);
      service.update(promo.id, { enabled: false }, 1);
      expect(service.findEnabledForBusinessDate('2026-09-23')).toBeNull();
    });

    it('returns the enabled one when two disabled overlap the same dates', () => {
      const live = service.create(nationalDay, 1);
      const d1 = service.create(
        {
          ...nationalDay,
          name: 'D1',
          startBusinessDate: '2026-10-01',
          endBusinessDate: '2026-10-01',
        },
        1,
      );
      service.update(d1.id, { enabled: false }, 1);
      service.update(d1.id, { startBusinessDate: '2026-09-23', endBusinessDate: '2026-09-25' }, 1);
      const d2 = service.create(
        {
          ...nationalDay,
          name: 'D2',
          startBusinessDate: '2026-11-01',
          endBusinessDate: '2026-11-01',
        },
        1,
      );
      service.update(d2.id, { enabled: false }, 1);
      service.update(d2.id, { startBusinessDate: '2026-09-23', endBusinessDate: '2026-09-25' }, 1);

      const found = service.findEnabledForBusinessDate('2026-09-24');
      expect(found).not.toBeNull();
      expect(found.id).toBe(live.id);
      expect(found.enabled).toBe(true);
    });

    it('rejects invalid date (400)', () => {
      expect(() => service.findEnabledForBusinessDate('nope')).toThrow(
        'Invalid date: nope (expected YYYY-MM-DD)',
      );
    });
  });

  describe('no DELETE', () => {
    it('exposes no delete/remove method (soft-disable only)', () => {
      expect((service as any).delete).toBeUndefined();
      expect((service as any).remove).toBeUndefined();
    });
  });
});
