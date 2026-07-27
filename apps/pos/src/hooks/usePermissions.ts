import { getMe } from '../api';

export interface Permissions {
  createOrder: boolean;
  updateOrder: boolean;
  deleteOrderItem: boolean;
  voidOrder: boolean;
  refundOrder: boolean;
  payOrder: boolean;
  manageMenu: boolean;
  manageTables: boolean;
  managePrinters: boolean;
  manageUsers: boolean;
  manageSettings: boolean;
}

const SAFE_DEFAULT: Permissions = {
  createOrder: false,
  updateOrder: false,
  deleteOrderItem: false,
  voidOrder: false,
  refundOrder: false,
  payOrder: false,
  manageMenu: false,
  manageTables: false,
  managePrinters: false,
  manageUsers: false,
  manageSettings: false,
};

export function usePermissions(): Permissions {
  const me = getMe();
  if (!me) return SAFE_DEFAULT;
  return {
    createOrder: me.createOrder,
    updateOrder: me.updateOrder,
    deleteOrderItem: me.deleteOrderItem,
    voidOrder: me.voidOrder,
    refundOrder: me.refundOrder,
    payOrder: me.payOrder,
    manageMenu: me.manageMenu,
    manageTables: me.manageTables,
    managePrinters: me.managePrinters,
    manageUsers: me.manageUsers,
    manageSettings: me.manageSettings,
  };
}
