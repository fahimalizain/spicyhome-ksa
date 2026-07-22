import {
  OrderStatus,
  OrderType,
  PrinterRole,
  AuditAction,
  InvoiceStatus,
  DayOpeningStatus,
} from './enums';

export interface UserRole {
  id: number;
  name: string;
  createOrder: boolean;
  updateOrder: boolean;
  deleteOrderItem: boolean;
  voidOrder: boolean;
  refundOrder: boolean;
  manageMenu: boolean;
  manageTables: boolean;
  managePrinters: boolean;
  manageUsers: boolean;
  manageSettings: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface User {
  id: number;
  username: string;
  pinHash: string;
  name: string;
  roleId: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface Table {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface Printer {
  id: number;
  name: string;
  ip: string;
  port: number;
  role: PrinterRole;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface ItemCategory {
  id: number;
  name: string;
  sortOrder: number;
  printerId: number | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface Item {
  id: number;
  categoryId: number;
  name: string;
  nameAr: string | null;
  priceHalalas: number;
  vatRateBp: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface Order {
  id: number;
  orderNo: number;
  uuid: string;
  type: OrderType;
  tableId: number | null;
  dayOpeningId: number;
  status: OrderStatus;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  discountHalalas: number;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface OrderItem {
  id: number;
  orderId: number;
  itemId: number | null;
  itemName: string;
  unitPriceHalalas: number;
  vatRateBp: number;
  qty: number;
  totalHalalas: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface OrderAuditLog {
  id: number;
  orderId: number;
  userId: number;
  action: AuditAction;
  payload: string;
  prevHash: string;
  hash: string;
  createdAt: number;
}

export interface Invoice {
  id: number;
  orderId: number;
  icv: number;
  uuid: string;
  invoiceHash: string;
  prevInvoiceHash: string;
  xml: string;
  qrTlv: string;
  status: InvoiceStatus;
  reportedAt: number | null;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface DayOpening {
  id: number;
  businessDate: string;
  status: DayOpeningStatus;
  openingCashHalalas: number;
  openedAt: number;
  openedBy: number;
  closedAt: number | null;
  closedBy: number | null;
  closingCashHalalas: number | null;
  totalSalesHalalas: number | null;
  totalVatHalalas: number | null;
  orderCount: number | null;
  createdAt: number;
  updatedAt: number;
  createdBy: number | null;
  updatedBy: number | null;
}

export interface Setting {
  key: string;
  value: string;
}
