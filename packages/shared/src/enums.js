"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrinterConnectionType = exports.DayOpeningStatus = exports.InvoiceStatus = exports.AuditAction = exports.PrinterRole = exports.OrderType = exports.ALL_ORDER_STATUSES = exports.OrderStatus = void 0;
exports.OrderStatus = {
    OPEN: 'open',
    PAID: 'paid',
    VOIDED: 'voided',
    REFUNDED: 'refunded',
};
exports.ALL_ORDER_STATUSES = [
    exports.OrderStatus.OPEN,
    exports.OrderStatus.PAID,
    exports.OrderStatus.VOIDED,
    exports.OrderStatus.REFUNDED,
];
exports.OrderType = {
    DINE_IN: 'dine_in',
    TAKEAWAY: 'takeaway',
};
exports.PrinterRole = {
    RECEIPT: 'receipt',
    KITCHEN: 'kitchen',
};
exports.PrinterConnectionType = {
    TCP: 'tcp',
    WINDOWS: 'windows',
};
exports.AuditAction = {
    CREATED: 'created',
    ITEM_ADDED: 'item_added',
    ITEM_UPDATED: 'item_updated',
    ITEM_REMOVED: 'item_removed',
    PAID: 'paid',
    VOIDED: 'voided',
    REFUNDED: 'refunded',
    REFUND_ISSUED: 'refund_issued',
    KITCHEN_PRINT_ENQUEUED: 'kitchen_print_enqueued',
    KITCHEN_PRINT_SUCCEEDED: 'kitchen_print_succeeded',
    RECEIPT_PRINT_ENQUEUED: 'receipt_print_enqueued',
    RECEIPT_PRINT_SUCCEEDED: 'receipt_print_succeeded',
};
exports.InvoiceStatus = {
    SIGNED: 'signed',
    REPORTED: 'reported',
    FAILED: 'failed',
};
exports.DayOpeningStatus = {
    OPEN: 'open',
    CLOSED: 'closed',
};
