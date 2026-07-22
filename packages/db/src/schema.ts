import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── user_roles ──────────────────────────────────────────────────────────────────

export const userRoles = sqliteTable('user_roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  createOrder: integer('create_order').notNull().default(0),
  updateOrder: integer('update_order').notNull().default(0),
  deleteOrderItem: integer('delete_order_item').notNull().default(0),
  voidOrder: integer('void_order').notNull().default(0),
  refundOrder: integer('refund_order').notNull().default(0),
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
  roleId: integer('role_id').references(() => userRoles.id).notNull(),
  isActive: integer('is_active').notNull().default(1),
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
  ip: text('ip').notNull(),
  port: integer('port').notNull().default(9100),
  role: text('role').notNull(),  // 'receipt' | 'kitchen'
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
  categoryId: integer('category_id').references(() => itemCategories.id).notNull(),
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
  status: text('status').notNull(),  // 'open' | 'closed'
  openingCashHalalas: integer('opening_cash_halalas').notNull().default(0),
  openedAt: integer('opened_at').notNull(),
  openedBy: integer('opened_by').references(() => users.id).notNull(),
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
    type: text('type').notNull(),  // 'dine_in' | 'takeaway'
    tableId: integer('table_id').references(() => tables.id),
    dayOpeningId: integer('day_opening_id').references(() => dayOpenings.id).notNull(),
    status: text('status').notNull(),  // 'open' | 'sent' | 'paid' | 'voided' | 'refunded'
    subtotalHalalas: integer('subtotal_halalas').notNull().default(0),
    vatHalalas: integer('vat_halalas').notNull().default(0),
    totalHalalas: integer('total_halalas').notNull().default(0),
    discountHalalas: integer('discount_halalas').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
  },
  (t) => ({
    idxOrdersDayOpening: index('idx_orders_day_opening').on(t.dayOpeningId),
    idxOrdersStatus: index('idx_orders_status').on(t.status),
    idxOrdersType: index('idx_orders_type').on(t.type),
  }),
);

// ── order_items ────────────────────────────────────────────────────────────────

export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').references(() => orders.id, {
    onDelete: 'cascade',
  }).notNull(),
  itemId: integer('item_id').references(() => items.id),
  itemName: text('item_name').notNull(),
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

// ── order_audit_log ────────────────────────────────────────────────────────────

export const orderAuditLog = sqliteTable('order_audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  action: text('action').notNull(),
  payload: text('payload').notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ── invoices ───────────────────────────────────────────────────────────────────

export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').references(() => orders.id).unique().notNull(),
  icv: integer('icv').unique().notNull(),
  uuid: text('uuid').unique().notNull(),
  invoiceHash: text('invoice_hash').notNull(),
  prevInvoiceHash: text('prev_invoice_hash').notNull(),
  xml: text('xml').notNull(),
  qrTlv: text('qr_tlv').notNull(),
  status: text('status').notNull(),  // 'signed' | 'reported' | 'failed'
  reportedAt: integer('reported_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
});

// ── settings ───────────────────────────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
