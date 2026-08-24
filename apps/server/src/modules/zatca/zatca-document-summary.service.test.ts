import { Test } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@spicyhome/db';
import { DRIZZLE } from '../database/database.module';
import { PrintersService } from '../printers/printers.service';
import { ZatcaInvoiceService } from './zatca-invoice.service';

describe('ZatcaInvoiceService.getDocumentsSummary', () => {
  let sqlite: Database.Database;
  let service: ZatcaInvoiceService;
  let now: number;
  let icv = 1;
  let orderNo = 1;

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const { findMigrationsDir, applyMigrations } = require('@spicyhome/db');
    applyMigrations(sqlite, findMigrationsDir());

    now = Math.floor(Date.now() / 1000);
    sqlite.exec(`
      INSERT INTO user_roles (id, name, create_order, update_order, delete_order_item, void_order, refund_order, pay_order, manage_menu, manage_tables, manage_printers, manage_users, manage_settings, created_at, updated_at)
      VALUES (1, 'admin', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ${now}, ${now});
      INSERT INTO users (id, username, pin_hash, name, role_id, is_active, created_at, updated_at)
      VALUES (1, 'admin', 'x', 'Admin', 1, 1, ${now}, ${now});
      INSERT INTO payment_methods (id, title, enabled, sort_order, zatca_payment_means_code, created_at, updated_at)
      VALUES ('cash', 'Cash', 1, 0, '10', ${now}, ${now});
    `);

    const db = drizzle(sqlite, { schema });
    const moduleFixture = await Test.createTestingModule({
      providers: [
        ZatcaInvoiceService,
        { provide: DRIZZLE, useValue: db },
        {
          provide: PrintersService,
          useValue: { getSetting: () => '', setSetting: () => undefined },
        },
      ],
    }).compile();

    service = moduleFixture.get(ZatcaInvoiceService);
  });

  afterAll(() => {
    sqlite.close();
  });

  function insertOrder(): number {
    sqlite.exec(`
      INSERT INTO day_openings (business_date, status, opened_at, opened_by, created_at, updated_at)
      VALUES ('2024-08-2${orderNo}', 'open', ${now}, 1, ${now}, ${now})
    `);
    const dayOpeningId = (
      sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
    ).id;
    sqlite.exec(`
      INSERT INTO orders (order_no, uuid, type, day_opening_id, status, document_id, created_at, updated_at)
      VALUES (${orderNo}, 'ord-${orderNo}', 'dine_in', ${dayOpeningId}, 'paid', 'INV-SUM-${orderNo}', ${now}, ${now})
    `);
    orderNo += 1;
    return (sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  }

  function insertInvoice(orderId: number, status: string): number {
    const nextIcv = icv++;
    sqlite.exec(`
      INSERT INTO zatca_invoices (order_id, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, created_at, updated_at)
      VALUES (${orderId}, ${nextIcv}, 'inv-sum-${nextIcv}', 'INV-SUM-DOC-${nextIcv}', 'h${nextIcv}', '', '<Invoice/>', 'tlv', '${status}', ${now}, ${now})
    `);
    return (sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  }

  function insertRefund(orderId: number): number {
    sqlite.exec(`
      INSERT INTO order_refunds (order_id, user_id, method_id, method_title, zatca_payment_means_code, subtotal_halalas, vat_halalas, total_halalas, document_id, created_at)
      VALUES (${orderId}, 1, 'cash', 'Cash', '10', 1000, 150, 1150, 'REF-SUM-${orderId}', ${now})
    `);
    return (sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  }

  function insertCreditNote(orderId: number, refundId: number, status: string): number {
    const nextIcv = icv++;
    sqlite.exec(`
      INSERT INTO zatca_credit_notes (order_id, refund_id, related_invoice_uuid, icv, uuid, document_id, invoice_hash, prev_invoice_hash, xml, qr_tlv, status, total_halalas, vat_halalas, created_at, updated_at)
      VALUES (${orderId}, ${refundId}, 'rel-${refundId}', ${nextIcv}, 'cn-sum-${nextIcv}', 'REF-SUM-DOC-${nextIcv}', 'ch${nextIcv}', '', '<CreditNote/>', 'tlv', '${status}', 1150, 150, ${now}, ${now})
    `);
    return (sqlite.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  }

  it('returns zeros when there are no documents', () => {
    expect(service.getDocumentsSummary()).toEqual({
      invoices: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0 },
      creditNotes: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0 },
      overall: { submitted: 0, queued: 0, failed: 0, rejected: 0, total: 0, health: 'ok' },
    });
  });

  it('counts current invoices and credit notes and ignores a burned rejected attempt', () => {
    const recoveredOrder = insertOrder();
    insertInvoice(recoveredOrder, 'rejected');
    insertInvoice(recoveredOrder, 'cleared');

    const failedOrder = insertOrder();
    insertInvoice(failedOrder, 'failed');

    const queuedOrder = insertOrder();
    insertInvoice(queuedOrder, 'signed');

    const cnOrder = insertOrder();
    insertInvoice(cnOrder, 'reported');
    const refundId = insertRefund(cnOrder);
    insertCreditNote(cnOrder, refundId, 'error');

    const rejectedOrder = insertOrder();
    insertInvoice(rejectedOrder, 'rejected');

    expect(service.getDocumentsSummary()).toEqual({
      invoices: { submitted: 2, queued: 1, failed: 1, rejected: 1, total: 5 },
      creditNotes: { submitted: 0, queued: 0, failed: 1, rejected: 0, total: 1 },
      overall: { submitted: 2, queued: 1, failed: 2, rejected: 1, total: 6, health: 'attention' },
    });
  });
});
