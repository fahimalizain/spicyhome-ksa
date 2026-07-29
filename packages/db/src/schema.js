"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settings = exports.orderPayments = exports.paymentMethods = exports.zatcaCreditNotes = exports.zatcaInvoices = exports.orderRefundItems = exports.orderRefunds = exports.orderEvents = exports.orderItems = exports.orders = exports.dayOpenings = exports.items = exports.itemCategories = exports.printers = exports.tables = exports.users = exports.userRoles = void 0;
const sqlite_core_1 = require("drizzle-orm/sqlite-core");
// ── user_roles ──────────────────────────────────────────────────────────────────
exports.userRoles = (0, sqlite_core_1.sqliteTable)('user_roles', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').unique().notNull(),
    createOrder: (0, sqlite_core_1.integer)('create_order').notNull().default(0),
    updateOrder: (0, sqlite_core_1.integer)('update_order').notNull().default(0),
    deleteOrderItem: (0, sqlite_core_1.integer)('delete_order_item').notNull().default(0),
    voidOrder: (0, sqlite_core_1.integer)('void_order').notNull().default(0),
    refundOrder: (0, sqlite_core_1.integer)('refund_order').notNull().default(0),
    payOrder: (0, sqlite_core_1.integer)('pay_order').notNull().default(0),
    manageMenu: (0, sqlite_core_1.integer)('manage_menu').notNull().default(0),
    manageTables: (0, sqlite_core_1.integer)('manage_tables').notNull().default(0),
    managePrinters: (0, sqlite_core_1.integer)('manage_printers').notNull().default(0),
    manageUsers: (0, sqlite_core_1.integer)('manage_users').notNull().default(0),
    manageSettings: (0, sqlite_core_1.integer)('manage_settings').notNull().default(0),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── users ──────────────────────────────────────────────────────────────────────
exports.users = (0, sqlite_core_1.sqliteTable)('users', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    username: (0, sqlite_core_1.text)('username').unique().notNull(),
    pinHash: (0, sqlite_core_1.text)('pin_hash').notNull(),
    name: (0, sqlite_core_1.text)('name').notNull(),
    roleId: (0, sqlite_core_1.integer)('role_id')
        .references(() => exports.userRoles.id)
        .notNull(),
    isActive: (0, sqlite_core_1.integer)('is_active').notNull().default(1),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── tables ─────────────────────────────────────────────────────────────────────
exports.tables = (0, sqlite_core_1.sqliteTable)('tables', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').unique().notNull(),
    sortOrder: (0, sqlite_core_1.integer)('sort_order').notNull().default(0),
    isActive: (0, sqlite_core_1.integer)('is_active').notNull().default(1),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── printers ───────────────────────────────────────────────────────────────────
exports.printers = (0, sqlite_core_1.sqliteTable)('printers', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').unique().notNull(),
    connectionType: (0, sqlite_core_1.text)('connection_type').notNull().default('tcp'),
    windowsPrinterName: (0, sqlite_core_1.text)('windows_printer_name'),
    ip: (0, sqlite_core_1.text)('ip').notNull(),
    port: (0, sqlite_core_1.integer)('port').notNull().default(9100),
    role: (0, sqlite_core_1.text)('role').notNull(), // 'receipt' | 'kitchen'
    config: (0, sqlite_core_1.text)('config').notNull().default('{}'),
    isActive: (0, sqlite_core_1.integer)('is_active').notNull().default(1),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── item_categories ────────────────────────────────────────────────────────────
exports.itemCategories = (0, sqlite_core_1.sqliteTable)('item_categories', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    name: (0, sqlite_core_1.text)('name').notNull(),
    sortOrder: (0, sqlite_core_1.integer)('sort_order').notNull().default(0),
    printerId: (0, sqlite_core_1.integer)('printer_id').references(() => exports.printers.id),
    isActive: (0, sqlite_core_1.integer)('is_active').notNull().default(1),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── items ──────────────────────────────────────────────────────────────────────
exports.items = (0, sqlite_core_1.sqliteTable)('items', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    categoryId: (0, sqlite_core_1.integer)('category_id')
        .references(() => exports.itemCategories.id)
        .notNull(),
    name: (0, sqlite_core_1.text)('name').notNull(),
    nameAr: (0, sqlite_core_1.text)('name_ar'),
    priceHalalas: (0, sqlite_core_1.integer)('price_halalas').notNull(),
    vatRateBp: (0, sqlite_core_1.integer)('vat_rate_bp').notNull().default(1500),
    sortOrder: (0, sqlite_core_1.integer)('sort_order').notNull().default(0),
    isActive: (0, sqlite_core_1.integer)('is_active').notNull().default(1),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── day_openings ───────────────────────────────────────────────────────────────
exports.dayOpenings = (0, sqlite_core_1.sqliteTable)('day_openings', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    businessDate: (0, sqlite_core_1.text)('business_date').notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(), // 'open' | 'closed'
    openingCashHalalas: (0, sqlite_core_1.integer)('opening_cash_halalas').notNull().default(0),
    openedAt: (0, sqlite_core_1.integer)('opened_at').notNull(),
    openedBy: (0, sqlite_core_1.integer)('opened_by')
        .references(() => exports.users.id)
        .notNull(),
    closedAt: (0, sqlite_core_1.integer)('closed_at'),
    closedBy: (0, sqlite_core_1.integer)('closed_by').references(() => exports.users.id),
    closingCashHalalas: (0, sqlite_core_1.integer)('closing_cash_halalas'),
    totalSalesHalalas: (0, sqlite_core_1.integer)('total_sales_halalas'),
    totalVatHalalas: (0, sqlite_core_1.integer)('total_vat_halalas'),
    orderCount: (0, sqlite_core_1.integer)('order_count'),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── orders ─────────────────────────────────────────────────────────────────────
exports.orders = (0, sqlite_core_1.sqliteTable)('orders', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderNo: (0, sqlite_core_1.integer)('order_no').notNull(),
    uuid: (0, sqlite_core_1.text)('uuid').unique().notNull(),
    type: (0, sqlite_core_1.text)('type').notNull(), // 'dine_in' | 'takeaway'
    tableId: (0, sqlite_core_1.integer)('table_id').references(() => exports.tables.id),
    dayOpeningId: (0, sqlite_core_1.integer)('day_opening_id')
        .references(() => exports.dayOpenings.id)
        .notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(), // 'open' | 'paid' | 'voided' | 'refunded'
    subtotalHalalas: (0, sqlite_core_1.integer)('subtotal_halalas').notNull().default(0),
    vatHalalas: (0, sqlite_core_1.integer)('vat_halalas').notNull().default(0),
    totalHalalas: (0, sqlite_core_1.integer)('total_halalas').notNull().default(0),
    discountHalalas: (0, sqlite_core_1.integer)('discount_halalas').notNull().default(0),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
}, (t) => ({
    idxOrdersDayOpening: (0, sqlite_core_1.index)('idx_orders_day_opening').on(t.dayOpeningId),
    idxOrdersStatus: (0, sqlite_core_1.index)('idx_orders_status').on(t.status),
    idxOrdersType: (0, sqlite_core_1.index)('idx_orders_type').on(t.type),
}));
// ── order_items ────────────────────────────────────────────────────────────────
exports.orderItems = (0, sqlite_core_1.sqliteTable)('order_items', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.integer)('order_id')
        .references(() => exports.orders.id, {
        onDelete: 'cascade',
    })
        .notNull(),
    itemId: (0, sqlite_core_1.integer)('item_id').references(() => exports.items.id),
    itemName: (0, sqlite_core_1.text)('item_name').notNull(),
    unitPriceHalalas: (0, sqlite_core_1.integer)('unit_price_halalas').notNull(),
    vatRateBp: (0, sqlite_core_1.integer)('vat_rate_bp').notNull(),
    qty: (0, sqlite_core_1.integer)('qty').notNull(),
    totalHalalas: (0, sqlite_core_1.integer)('total_halalas').notNull(),
    notes: (0, sqlite_core_1.text)('notes'),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── order_events ───────────────────────────────────────────────────────────────
exports.orderEvents = (0, sqlite_core_1.sqliteTable)('order_events', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.integer)('order_id')
        .references(() => exports.orders.id)
        .notNull(),
    eventIdx: (0, sqlite_core_1.integer)('event_idx').notNull(),
    userId: (0, sqlite_core_1.integer)('user_id')
        .references(() => exports.users.id)
        .notNull(),
    type: (0, sqlite_core_1.text)('type').notNull(),
    payload: (0, sqlite_core_1.text)('payload').notNull(),
    prevHash: (0, sqlite_core_1.text)('prev_hash').notNull(),
    hash: (0, sqlite_core_1.text)('hash').notNull(),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
// ── order_refunds ──────────────────────────────────────────────────────────────
exports.orderRefunds = (0, sqlite_core_1.sqliteTable)('order_refunds', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.integer)('order_id')
        .references(() => exports.orders.id)
        .notNull(),
    userId: (0, sqlite_core_1.integer)('user_id')
        .references(() => exports.users.id)
        .notNull(),
    methodId: (0, sqlite_core_1.text)('method_id')
        .references(() => exports.paymentMethods.id)
        .notNull(),
    methodTitle: (0, sqlite_core_1.text)('method_title').notNull(),
    subtotalHalalas: (0, sqlite_core_1.integer)('subtotal_halalas').notNull(),
    vatHalalas: (0, sqlite_core_1.integer)('vat_halalas').notNull(),
    totalHalalas: (0, sqlite_core_1.integer)('total_halalas').notNull(),
    reason: (0, sqlite_core_1.text)('reason'),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedAt: (0, sqlite_core_1.integer)('updated_at'),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── order_refund_items ─────────────────────────────────────────────────────────
exports.orderRefundItems = (0, sqlite_core_1.sqliteTable)('order_refund_items', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    refundId: (0, sqlite_core_1.integer)('refund_id')
        .references(() => exports.orderRefunds.id, { onDelete: 'cascade' })
        .notNull(),
    orderItemId: (0, sqlite_core_1.integer)('order_item_id').references(() => exports.orderItems.id),
    itemName: (0, sqlite_core_1.text)('item_name').notNull(),
    unitPriceHalalas: (0, sqlite_core_1.integer)('unit_price_halalas').notNull(),
    vatRateBp: (0, sqlite_core_1.integer)('vat_rate_bp').notNull(),
    qty: (0, sqlite_core_1.integer)('qty').notNull(),
    totalHalalas: (0, sqlite_core_1.integer)('total_halalas').notNull(),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
// ── zatca_invoices ─────────────────────────────────────────────────────────────
exports.zatcaInvoices = (0, sqlite_core_1.sqliteTable)('zatca_invoices', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.integer)('order_id')
        .references(() => exports.orders.id)
        .unique()
        .notNull(),
    icv: (0, sqlite_core_1.integer)('icv').unique().notNull(),
    uuid: (0, sqlite_core_1.text)('uuid').unique().notNull(),
    invoiceHash: (0, sqlite_core_1.text)('invoice_hash').notNull(),
    prevInvoiceHash: (0, sqlite_core_1.text)('prev_invoice_hash').notNull(),
    xml: (0, sqlite_core_1.text)('xml').notNull(),
    qrTlv: (0, sqlite_core_1.text)('qr_tlv').notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(), // 'signed' | 'reported' | 'failed'
    reportedAt: (0, sqlite_core_1.integer)('reported_at'),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── zatca_credit_notes ────────────────────────────────────────────────────────
exports.zatcaCreditNotes = (0, sqlite_core_1.sqliteTable)('zatca_credit_notes', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.integer)('order_id')
        .references(() => exports.orders.id)
        .notNull(),
    refundId: (0, sqlite_core_1.integer)('refund_id')
        .references(() => exports.orderRefunds.id)
        .notNull()
        .unique(),
    relatedInvoiceUuid: (0, sqlite_core_1.text)('related_invoice_uuid').notNull(),
    icv: (0, sqlite_core_1.integer)('icv').notNull().unique(),
    uuid: (0, sqlite_core_1.text)('uuid').notNull().unique(),
    invoiceHash: (0, sqlite_core_1.text)('invoice_hash').notNull(),
    prevInvoiceHash: (0, sqlite_core_1.text)('prev_invoice_hash').notNull(),
    xml: (0, sqlite_core_1.text)('xml').notNull(),
    qrTlv: (0, sqlite_core_1.text)('qr_tlv').notNull(),
    status: (0, sqlite_core_1.text)('status').notNull(), // 'signed' | 'reported' | 'failed'
    reportedAt: (0, sqlite_core_1.integer)('reported_at'),
    totalHalalas: (0, sqlite_core_1.integer)('total_halalas').notNull(),
    vatHalalas: (0, sqlite_core_1.integer)('vat_halalas').notNull(),
    reason: (0, sqlite_core_1.text)('reason'),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── payment_methods ────────────────────────────────────────────────────────────
exports.paymentMethods = (0, sqlite_core_1.sqliteTable)('payment_methods', {
    id: (0, sqlite_core_1.text)('id').primaryKey(),
    title: (0, sqlite_core_1.text)('title').notNull(),
    enabled: (0, sqlite_core_1.integer)('enabled').notNull().default(1),
    sortOrder: (0, sqlite_core_1.integer)('sort_order').notNull().default(0),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
    updatedBy: (0, sqlite_core_1.integer)('updated_by').references(() => exports.users.id),
});
// ── order_payments ─────────────────────────────────────────────────────────────
exports.orderPayments = (0, sqlite_core_1.sqliteTable)('order_payments', {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    orderId: (0, sqlite_core_1.integer)('order_id')
        .references(() => exports.orders.id)
        .notNull(),
    methodId: (0, sqlite_core_1.text)('method_id')
        .references(() => exports.paymentMethods.id)
        .notNull(),
    methodTitle: (0, sqlite_core_1.text)('method_title').notNull(),
    amountHalalas: (0, sqlite_core_1.integer)('amount_halalas').notNull(),
    tenderedHalalas: (0, sqlite_core_1.integer)('tendered_halalas'),
    changeHalalas: (0, sqlite_core_1.integer)('change_halalas'),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    createdBy: (0, sqlite_core_1.integer)('created_by').references(() => exports.users.id),
}, (t) => ({
    uniqueOrderMethod: (0, sqlite_core_1.uniqueIndex)('idx_order_payments_order_method').on(t.orderId, t.methodId),
}));
// ── settings ───────────────────────────────────────────────────────────────────
exports.settings = (0, sqlite_core_1.sqliteTable)('settings', {
    key: (0, sqlite_core_1.text)('key').primaryKey(),
    value: (0, sqlite_core_1.text)('value').notNull(),
});
