export declare const OrderStatus: {
    readonly OPEN: "open";
    readonly PAID: "paid";
    readonly VOIDED: "voided";
    readonly REFUNDED: "refunded";
};
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export declare const ALL_ORDER_STATUSES: OrderStatus[];
export declare const OrderType: {
    readonly DINE_IN: "dine_in";
    readonly TAKEAWAY: "takeaway";
};
export type OrderType = (typeof OrderType)[keyof typeof OrderType];
export declare const PrinterRole: {
    readonly RECEIPT: "receipt";
    readonly KITCHEN: "kitchen";
};
export type PrinterRole = (typeof PrinterRole)[keyof typeof PrinterRole];
export declare const PrinterConnectionType: {
    readonly TCP: "tcp";
    readonly WINDOWS: "windows";
};
export type PrinterConnectionType = (typeof PrinterConnectionType)[keyof typeof PrinterConnectionType];
export declare const AuditAction: {
    readonly CREATED: "created";
    readonly ITEM_ADDED: "item_added";
    readonly ITEM_UPDATED: "item_updated";
    readonly ITEM_REMOVED: "item_removed";
    readonly PAID: "paid";
    readonly VOIDED: "voided";
    readonly REFUNDED: "refunded";
    readonly REFUND_ISSUED: "refund_issued";
    readonly KITCHEN_PRINT_ENQUEUED: "kitchen_print_enqueued";
    readonly KITCHEN_PRINT_SUCCEEDED: "kitchen_print_succeeded";
    readonly RECEIPT_PRINT_ENQUEUED: "receipt_print_enqueued";
    readonly RECEIPT_PRINT_SUCCEEDED: "receipt_print_succeeded";
};
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export declare const InvoiceStatus: {
    readonly SIGNED: "signed";
    readonly REPORTED: "reported";
    readonly FAILED: "failed";
};
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export declare const DayOpeningStatus: {
    readonly OPEN: "open";
    readonly CLOSED: "closed";
};
export type DayOpeningStatus = (typeof DayOpeningStatus)[keyof typeof DayOpeningStatus];
