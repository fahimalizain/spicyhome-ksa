import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';

// ── user_roles ──────────────────────────────────────────────────────────────────

export const userRoles = sqliteTable('user_roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  createOrder: integer('create_order').notNull().default(0),
  updateOrder: integer('update_order').notNull().default(0),
  deleteOrderItem: integer('delete_order_item').notNull().default(0),
  voidOrder: integer('void_order').notNull().default(0),
  refundOrder: integer('refund_order').notNull().default(0),
  payOrder: integer('pay_order').notNull().default(0),
  manageMenu: integer('manage_menu').notNull().default(0),
  manageTables: integer('manage_tables').notNull().default(0),
  managePrinters: integer('manage_printers').notNull().default(0),
  manageUsers: integer('manage_users').notNull().default(0),
  manageSettings: integer('manage_settings').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references((): any => users.id),
  updatedBy: integer('updated_by').references((): any => users.id),
});

// ── users ──────────────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique().notNull(),
  pinHash: text('pin_hash').notNull(),
  name: text('name').notNull(),
  roleId: integer('role_id')
    .references(() => userRoles.id)
    .notNull(),
  isActive: integer('is_active').notNull().default(1),
  androidLogin: integer('android_login').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references((): any => users.id),
  updatedBy: integer('updated_by').references((): any => users.id),
});

// ── tables ─────────────────────────────────────────────────────────────────────

export const tables = sqliteTable('tables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── printers ───────────────────────────────────────────────────────────────────

export const printers = sqliteTable('printers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  connectionType: text('connection_type').notNull().default('tcp'), // 'tcp' | 'windows'
  windowsPrinterName: text('windows_printer_name'), // nullable, required when connection_type = 'windows'
  ip: text('ip').notNull(),
  port: integer('port').notNull().default(9100),
  role: text('role').notNull(), // 'receipt' | 'kitchen'
  config: text('config').notNull().default('{}'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── item_categories ────────────────────────────────────────────────────────────

export const itemCategories = sqliteTable('item_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  printerId: integer('printer_id').references(() => printers.id),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── items ──────────────────────────────────────────────────────────────────────

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id')
    .references(() => itemCategories.id)
    .notNull(),
  name: text('name').notNull(),
  nameAr: text('name_ar'),
  priceHalalas: integer('price_halalas').notNull(),
  vatRateBp: integer('vat_rate_bp').notNull().default(1500),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── day_openings ───────────────────────────────────────────────────────────────

export const dayOpenings = sqliteTable('day_openings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessDate: text('business_date').notNull(),
  status: text('status').notNull(), // 'open' | 'closed'
  openingCashHalalas: integer('opening_cash_halalas').notNull().default(0),
  openedAt: integer('opened_at').notNull(),
  openedBy: integer('opened_by')
    .references(() => users.id)
    .notNull(),
  closedAt: integer('closed_at'),
  closedBy: integer('closed_by').references(() => users.id),
  closingCashHalalas: integer('closing_cash_halalas'),
  totalSalesHalalas: integer('total_sales_halalas'),
  totalVatHalalas: integer('total_vat_halalas'),
  orderCount: integer('order_count'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── orders ─────────────────────────────────────────────────────────────────────

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderNo: integer('order_no').notNull(),
    uuid: text('uuid').unique().notNull(),
    type: text('type').notNull(), // 'dine_in' | 'takeaway'
    tableId: integer('table_id').references(() => tables.id),
    dayOpeningId: integer('day_opening_id')
      .references(() => dayOpenings.id)
      .notNull(),
    status: text('status').notNull(), // 'open' | 'paid' | 'voided' | 'refunded'
    subtotalHalalas: integer('subtotal_halalas').notNull().default(0),
    vatHalalas: integer('vat_halalas').notNull().default(0),
    totalHalalas: integer('total_halalas').notNull().default(0),
    discountHalalas: integer('discount_halalas').notNull().default(0),
    isStandardInvoice: integer('is_standard_invoice').notNull().default(0),
    zatcaBuyerDetails: text('zatca_buyer_details'),
    documentId: text('document_id').notNull().unique(),
    // Delivery partner linking (ADR 0007): nullable, only meaningful for
    // type = 'takeaway' orders. A walk-in takeaway has NULL.
    deliveryPartnerId: text('delivery_partner_id').references(() => deliveryPartners.id),
    // The delivery app's order number for reconciliation (e.g. HungerStation
    // order ID). Free text, only meaningful alongside deliveryPartnerId.
    deliveryExternalRef: text('delivery_external_ref'),
    // Order-level notes ("Order notes" / "Remarks"). Free text, nullable —
    // same semantics as order_items.notes.
    notes: text('notes'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    idxOrdersDayOpening: index('idx_orders_day_opening').on(t.dayOpeningId),
    idxOrdersStatus: index('idx_orders_status').on(t.status),
    idxOrdersType: index('idx_orders_type').on(t.type),
    idxOrdersDeliveryPartner: index('idx_orders_delivery_partner').on(t.deliveryPartnerId),
  }),
);

// ── order_items ────────────────────────────────────────────────────────────────

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .references(() => orders.id, {
      onDelete: 'cascade',
    })
    .notNull(),
  itemId: integer('item_id').references(() => items.id),
  itemName: text('item_name').notNull(),
  itemNameAr: text('item_name_ar'),
  unitPriceHalalas: integer('unit_price_halalas').notNull(),
  vatRateBp: integer('vat_rate_bp').notNull(),
  qty: integer('qty').notNull(),
  totalHalalas: integer('total_halalas').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── order_events ───────────────────────────────────────────────────────────────

export const orderEvents = sqliteTable('order_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  eventIdx: integer('event_idx').notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  type: text('type').notNull(),
  payload: text('payload').notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ── order_refunds ──────────────────────────────────────────────────────────────

export const orderRefunds = sqliteTable('order_refunds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  methodId: text('method_id')
    .references(() => paymentMethods.id)
    .notNull(),
  methodTitle: text('method_title').notNull(),
  // Snapshot of payment_methods.zatca_payment_means_code at refund time.
  zatcaPaymentMeansCode: text('zatca_payment_means_code').notNull(),
  subtotalHalalas: integer('subtotal_halalas').notNull(),
  vatHalalas: integer('vat_halalas').notNull(),
  totalHalalas: integer('total_halalas').notNull(),
  reason: text('reason'),
  documentId: text('document_id').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedAt: integer('updated_at'),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── order_refund_items ─────────────────────────────────────────────────────────

export const orderRefundItems = sqliteTable('order_refund_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  refundId: integer('refund_id')
    .references(() => orderRefunds.id, { onDelete: 'cascade' })
    .notNull(),
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  itemName: text('item_name').notNull(),
  itemNameAr: text('item_name_ar'),
  unitPriceHalalas: integer('unit_price_halalas').notNull(),
  vatRateBp: integer('vat_rate_bp').notNull(),
  qty: integer('qty').notNull(),
  totalHalalas: integer('total_halalas').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ── zatca_invoices ─────────────────────────────────────────────────────────────

export const zatcaInvoices = sqliteTable(
  'zatca_invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .references(() => orders.id)
      .notNull(),
    icv: integer('icv').unique().notNull(),
    uuid: text('uuid').unique().notNull(),
    // Snapshot of orders.document_id at attempt time
    // (stable even if the live order ID is later rotated on rejection).
    documentId: text('document_id').notNull().unique(),
    invoiceHash: text('invoice_hash').notNull(),
    prevInvoiceHash: text('prev_invoice_hash').notNull(),
    xml: text('xml').notNull(),
    qrTlv: text('qr_tlv').notNull(),
    status: text('status').notNull(),
    // simplified: 'signed' | 'reported' | 'failed'
    // standard:   'pending' | 'cleared' | 'rejected' | 'error'
    attemptNo: integer('attempt_no').notNull().default(1),
    clearanceErrors: text('clearance_errors'),
    clearanceWarnings: text('clearance_warnings'),
    httpStatus: integer('http_status'),
    reportedAt: integer('reported_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    idxZatcaInvoicesOrderId: index('idx_zatca_invoices_order_id').on(t.orderId),
  }),
);

// At most one cleared invoice per order — enforced by partial unique index
// in a custom migration (SQLite does not support partial unique indexes
// via drizzle-orm):
//
//   CREATE UNIQUE INDEX IF NOT EXISTS zatca_invoices_one_cleared_per_order
//     ON zatca_invoices (order_id) WHERE status = 'cleared';

// ── zatca_credit_notes ────────────────────────────────────────────────────────

export const zatcaCreditNotes = sqliteTable(
  'zatca_credit_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .references(() => orders.id)
      .notNull(),
    refundId: integer('refund_id')
      .references(() => orderRefunds.id)
      .notNull(),
    relatedInvoiceUuid: text('related_invoice_uuid').notNull(),
    icv: integer('icv').notNull().unique(),
    uuid: text('uuid').notNull().unique(),
    // Snapshot of order_refunds.document_id at attempt time
    // (stable even if the live refund ID is later rotated on rejection).
    documentId: text('document_id').notNull().unique(),
    invoiceHash: text('invoice_hash').notNull(),
    prevInvoiceHash: text('prev_invoice_hash').notNull(),
    xml: text('xml').notNull(),
    qrTlv: text('qr_tlv').notNull(),
    status: text('status').notNull(),
    // simplified: 'signed' | 'reported' | 'failed'
    // standard:   'pending' | 'cleared' | 'rejected' | 'error'
    attemptNo: integer('attempt_no').notNull().default(1),
    clearanceErrors: text('clearance_errors'),
    clearanceWarnings: text('clearance_warnings'),
    httpStatus: integer('http_status'),
    reportedAt: integer('reported_at'),
    totalHalalas: integer('total_halalas').notNull(),
    vatHalalas: integer('vat_halalas').notNull(),
    reason: text('reason'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    idxZatcaCreditNotesRefundId: index('idx_zatca_credit_notes_refund_id').on(t.refundId),
    idxZatcaCreditNotesOrderId: index('idx_zatca_credit_notes_order_id').on(t.orderId),
  }),
);

// At most one cleared credit note per refund — enforced by partial unique index
// in a custom migration (SQLite does not support partial unique indexes
// via drizzle-orm):
//
//   CREATE UNIQUE INDEX IF NOT EXISTS zatca_credit_notes_one_cleared_per_refund
//     ON zatca_credit_notes (refund_id) WHERE status = 'cleared';

// ── payment_methods ────────────────────────────────────────────────────────────

export const paymentMethods = sqliteTable('payment_methods', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  // Catalog value (ZATCA BT-81, UNTDID 4461 subset 10|30|42|48|1) — the live
  // source that order_payments / order_refunds snapshot at pay/refund time.
  zatcaPaymentMeansCode: text('zatca_payment_means_code').notNull(),
  enabled: integer('enabled').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references((): any => users.id),
  updatedBy: integer('updated_by').references((): any => users.id),
});

// ── delivery_partners ──────────────────────────────────────────────────────────
//
// Delivery app catalog (HungerStation, Keeta, ...). Each partner owns exactly
// one payment_methods row sharing the same slug id (ADR 0007). Soft-disable
// only — no DELETE endpoint.

export const deliveryPartners = sqliteTable('delivery_partners', {
  id: text('id').primaryKey(), // slug (kebab-case), immutable
  title: text('title').notNull(),
  enabled: integer('enabled').notNull().default(1), // 0/1, soft-disable only
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references((): any => users.id),
  updatedBy: integer('updated_by').references((): any => users.id),
});

// ── order_payments ─────────────────────────────────────────────────────────────
//
// Append-only payment ledger (ADR 0006). Multiple rows per (order, method) are
// allowed — corrections are new lines, and amount_halalas is a signed integer
// (negatives allowed for balancing/correction lines). No CHECK constraint here:
// server-side rules enforce amountHalalas != 0 and SUM(all amounts) >= 0.

export const orderPayments = sqliteTable('order_payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .references(() => orders.id)
    .notNull(),
  methodId: text('method_id')
    .references(() => paymentMethods.id)
    .notNull(),
  methodTitle: text('method_title').notNull(),
  // Snapshot of payment_methods.zatca_payment_means_code at pay time.
  zatcaPaymentMeansCode: text('zatca_payment_means_code').notNull(),
  // Signed integer halalas: positive lines are payments, negative lines are
  // corrections (ADR 0006). SQLite integers already allow negatives.
  amountHalalas: integer('amount_halalas').notNull(),
  tenderedHalalas: integer('tendered_halalas'),
  changeHalalas: integer('change_halalas'),
  createdAt: integer('created_at').notNull(),
  createdBy: integer('created_by').references((): any => users.id),
});

// ── settings ───────────────────────────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
