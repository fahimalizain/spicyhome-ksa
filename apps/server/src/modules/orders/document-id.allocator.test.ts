/**
 * DocumentIdService — Unit Tests
 *
 * Tests document ID allocation for ZATCA e-invoicing:
 * - INV format /^INV\d{2}-\d{4,}$/
 * - REF format
 * - Year boundary resets seq
 * - Separate counters for INV vs REF
 * - Empty org unit uses "Default" (no throw)
 */

import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { DatabaseModule, DRIZZLE } from '../database/database.module';
import { PrintersModule } from '../printers/printers.module';
import { PrintersService } from '../printers/printers.service';
import { DocumentIdService } from './document-id.allocator';
import { zatcaKey } from '@spicyhome/shared';
import type { ZATCAEnvironment } from '@spicyhome/shared';

describe('DocumentIdService', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let service: DocumentIdService;
  let printersService: PrintersService;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });

    // Apply migrations to create all tables (including settings)
    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db');
    const migrationsDir = findMigrationsDir();
    applyMigrations(sqlite, migrationsDir);

    const moduleFixture = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), DatabaseModule, PrintersModule],
      providers: [DocumentIdService],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    const app = moduleFixture.createNestApplication();
    await app.init();

    service = app.get(DocumentIdService);
    printersService = app.get(PrintersService);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    // Clear settings between tests
    sqlite.exec("DELETE FROM settings WHERE key LIKE 'zatca_%'");
  });

  // ── INV format ──────────────────────────────────────────────────────────────

  describe('allocateInvoiceDocumentId', () => {
    it('returns format matching /^INV\\d{2}-\\d{4,}$/', () => {
      const id = service.allocateInvoiceDocumentId(db);
      // INV + two-digit year + dash + at least 4 digits
      expect(id).toMatch(/^INV\d{2}-\d{4,}$/);
    });

    it('increments sequentially', () => {
      const first = service.allocateInvoiceDocumentId(db);
      const second = service.allocateInvoiceDocumentId(db);
      const third = service.allocateInvoiceDocumentId(db);

      expect(first).toMatch(/^INV\d{2}-0001$/);
      expect(second).toMatch(/^INV\d{2}-0002$/);
      expect(third).toMatch(/^INV\d{2}-0003$/);
    });

    it('pads to at least 4 digits', () => {
      // Allocate 9999 to test next becomes 5 digits
      const env = printersService.getSetting('zatca_environment', 'simulation') as ZATCAEnvironment;
      const orgUnit = printersService.getSetting('zatca_org_unit', '');
      const ouSlug = !orgUnit || !orgUnit.trim() ? 'Default' : orgUnit;
      // Use zatcaKey() to match what the allocator will use internally
      const key = zatcaKey(env, ouSlug, 'last_inv_document');

      const now = new Date();
      const yy = parseInt(
        now.toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh', year: '2-digit' }),
        10,
      );
      const paddedYy = String(yy).padStart(2, '0');

      // Seed counter at 9999
      sqlite
        .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run(key, `${yy}:9999`);

      const id = service.allocateInvoiceDocumentId(db);
      // Should be 5-digit: INV{yy}-10000
      expect(id).toBe(`INV${paddedYy}-10000`);
    });

    it('has separate counter from REF', () => {
      const invFirst = service.allocateInvoiceDocumentId(db);
      const refFirst = service.allocateRefundDocumentId(db);

      // Both start at 0001 for their respective sequences
      expect(invFirst).toMatch(/-0001$/);
      expect(refFirst).toMatch(/-0001$/);

      // Allocate another INV — should be 0002, REF stays 0001
      const invSecond = service.allocateInvoiceDocumentId(db);
      expect(invSecond).toMatch(/-0002$/);

      const refCheck = service.allocateRefundDocumentId(db);
      expect(refCheck).toMatch(/-0002$/);
    });
  });

  // ── REF format ──────────────────────────────────────────────────────────────

  describe('allocateRefundDocumentId', () => {
    it('returns format matching /^REF\\d{2}-\\d{4,}$/', () => {
      const id = service.allocateRefundDocumentId(db);
      expect(id).toMatch(/^REF\d{2}-\d{4,}$/);
    });

    it('increments sequentially', () => {
      const first = service.allocateRefundDocumentId(db);
      const second = service.allocateRefundDocumentId(db);

      expect(first).toMatch(/^REF\d{2}-0001$/);
      expect(second).toMatch(/^REF\d{2}-0002$/);
    });
  });

  // ── Year boundary ───────────────────────────────────────────────────────────

  describe('year boundary', () => {
    it('resets sequence when year changes', () => {
      // Use a fixed timestamp at end of 2025 (Dec 31 2025 23:59 UTC = Jan 1 2026 02:59 Riyadh)
      // Actually we need to be at end of year in Riyadh timezone.
      // Dec 31 2025 21:00 UTC = Jan 1 2026 00:00 Riyadh (UTC+3)
      const endOf2025Riyadh = Date.UTC(2025, 11, 31, 20, 59, 59); // 23:59 Riyadh on Dec 31

      // Allocate in "2025"
      const first = service.allocateInvoiceDocumentId(db, endOf2025Riyadh);
      // Year should be 25
      expect(first).toMatch(/^INV25-\d{4,}$/);
      expect(first).toMatch(/^INV25-0001$/);

      const second = service.allocateInvoiceDocumentId(db, endOf2025Riyadh);
      expect(second).toMatch(/^INV25-0002$/);

      // Now cross to 2026: Jan 1 2026 00:00 Riyadh = Dec 31 2025 21:00 UTC
      const startOf2026Riyadh = Date.UTC(2025, 11, 31, 21, 0, 0);

      const third = service.allocateInvoiceDocumentId(db, startOf2026Riyadh);
      expect(third).toMatch(/^INV26-0001$/);
    });
  });

  // ── Empty org unit ──────────────────────────────────────────────────────────

  describe('empty org unit', () => {
    it('uses "Default" when org unit is empty or whitespace', () => {
      // Set zatca_org_unit to empty
      printersService.setSetting('zatca_org_unit', '');

      // Should not throw — uses "Default" internally
      expect(() => service.allocateInvoiceDocumentId(db)).not.toThrow();
      const id = service.allocateInvoiceDocumentId(db);
      expect(id).toMatch(/^INV\d{2}-\d{4,}$/);
    });

    it('uses "Default" when org unit is whitespace', () => {
      printersService.setSetting('zatca_org_unit', '   ');
      expect(() => service.allocateInvoiceDocumentId(db)).not.toThrow();
      const id = service.allocateInvoiceDocumentId(db);
      expect(id).toMatch(/^INV\d{2}-\d{4,}$/);
    });

    it('uses provided org unit for scoping when set', () => {
      printersService.setSetting('zatca_org_unit', 'SpicyHome POS');

      const id = service.allocateInvoiceDocumentId(db);
      expect(id).toMatch(/^INV\d{2}-\d{4,}$/);

      // Verify the key was written with the slugified org unit (zatcaKey slugifies to kebab-case)
      const keys = sqlite
        .prepare("SELECT key FROM settings WHERE key LIKE '%_last_inv_document'")
        .all() as any[];
      expect(keys.length).toBeGreaterThan(0);
      // zatcaKey slugifies "SpicyHome POS" → "spicyhome-pos"
      expect(keys.some((k: any) => k.key.includes('spicyhome-pos'))).toBe(true);
    });
  });

  // ── Zero-padding ────────────────────────────────────────────────────────────

  describe('zero padding', () => {
    it('pads year to 2 digits for single-digit years', () => {
      // Year 2001 in Riyadh = 1 → should become "01"
      const dateIn2001 = Date.UTC(2001, 5, 15, 0, 0, 0); // Jun 15 2001 00:00 UTC = 03:00 Riyadh
      const id = service.allocateInvoiceDocumentId(db, dateIn2001);
      // Year is 01 (since 2001 % 100 = 1, padded to "01")
      expect(id).toMatch(/^INV01-\d{4,}$/);
    });

    it('pads sequence to 4 digits', () => {
      const id = service.allocateInvoiceDocumentId(db);
      expect(id).toMatch(/-0001$/);
    });
  });
});
