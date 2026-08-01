export const OrderStatus = {
  OPEN: 'open',
  PAID: 'paid',
  VOIDED: 'voided',
  REFUNDED: 'refunded',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.PAID,
  OrderStatus.VOIDED,
  OrderStatus.REFUNDED,
];

export const OrderType = {
  DINE_IN: 'dine_in',
  TAKEAWAY: 'takeaway',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const PrinterRole = {
  RECEIPT: 'receipt',
  KITCHEN: 'kitchen',
} as const;
export type PrinterRole = (typeof PrinterRole)[keyof typeof PrinterRole];

export const PrinterConnectionType = {
  TCP: 'tcp',
  WINDOWS: 'windows',
} as const;
export type PrinterConnectionType =
  (typeof PrinterConnectionType)[keyof typeof PrinterConnectionType];

export const AuditAction = {
  CREATED: 'created',
  ITEM_ADDED: 'item_added',
  ITEM_UPDATED: 'item_updated',
  ITEM_REMOVED: 'item_removed',
  PAID: 'paid',
  PAYMENT_ADDED: 'payment_added',
  VOIDED: 'voided',
  REFUNDED: 'refunded',
  REFUND_ISSUED: 'refund_issued',
  KITCHEN_PRINT_ENQUEUED: 'kitchen_print_enqueued',
  KITCHEN_PRINT_SUCCEEDED: 'kitchen_print_succeeded',
  RECEIPT_PRINT_ENQUEUED: 'receipt_print_enqueued',
  RECEIPT_PRINT_SUCCEEDED: 'receipt_print_succeeded',
  TYPE_CHANGED: 'type_changed',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const InvoiceStatus = {
  SIGNED: 'signed',
  REPORTED: 'reported',
  FAILED: 'failed',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const DayOpeningStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;
export type DayOpeningStatus = (typeof DayOpeningStatus)[keyof typeof DayOpeningStatus];
