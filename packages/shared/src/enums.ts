export const OrderStatus = {
  OPEN: 'open',
  SENT: 'sent',
  PAID: 'paid',
  VOIDED: 'voided',
  REFUNDED: 'refunded',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.OPEN,
  OrderStatus.SENT,
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

export const AuditAction = {
  CREATED: 'created',
  ITEM_ADDED: 'item_added',
  ITEM_REMOVED: 'item_removed',
  SENT_TO_KITCHEN: 'sent_to_kitchen',
  PAID: 'paid',
  PRINTED: 'printed',
  VOIDED: 'voided',
  REFUNDED: 'refunded',
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
