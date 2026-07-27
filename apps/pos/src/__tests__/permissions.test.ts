import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePermissions } from '../hooks/usePermissions';
import type { MeResponse } from '@spicyhome/client-ts';

const mockGetMe = vi.fn();

vi.mock('../api', () => ({
  getMe: () => mockGetMe(),
  client: {} as any,
  setToken: vi.fn(),
  setMe: vi.fn(),
  clearToken: vi.fn(),
  getToken: vi.fn(),
  isAuthenticated: vi.fn(),
}));

function makeMe(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 1,
    username: 'test',
    name: 'Test User',
    roleId: 1,
    roleName: 'staff',
    isActive: true,
    createOrder: true,
    updateOrder: true,
    deleteOrderItem: false,
    voidOrder: false,
    refundOrder: false,
    payOrder: false,
    manageMenu: false,
    manageTables: false,
    managePrinters: false,
    manageUsers: false,
    manageSettings: false,
    ...overrides,
  };
}

describe('usePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SAFE_DEFAULT all false when getMe returns null', () => {
    mockGetMe.mockReturnValue(null);
    // We must call usePermissions inside a component/hook context, but it's synchronous,
    // so we can test the function directly by reading its logic.
    // Since usePermissions reads from getMe() directly (not via useState/useEffect),
    // we can call it outside React.
    const perms = usePermissions();
    expect(perms.createOrder).toBe(false);
    expect(perms.updateOrder).toBe(false);
    expect(perms.deleteOrderItem).toBe(false);
    expect(perms.voidOrder).toBe(false);
    expect(perms.refundOrder).toBe(false);
    expect(perms.payOrder).toBe(false);
    expect(perms.manageMenu).toBe(false);
    expect(perms.manageTables).toBe(false);
    expect(perms.managePrinters).toBe(false);
    expect(perms.manageUsers).toBe(false);
    expect(perms.manageSettings).toBe(false);
  });

  it('returns correct booleans when getMe returns data', () => {
    mockGetMe.mockReturnValue(
      makeMe({
        createOrder: true,
        updateOrder: true,
        deleteOrderItem: true,
        voidOrder: true,
        refundOrder: false,
        payOrder: true,
        manageMenu: true,
        manageTables: false,
      }),
    );

    const perms = usePermissions();

    expect(perms.createOrder).toBe(true);
    expect(perms.updateOrder).toBe(true);
    expect(perms.deleteOrderItem).toBe(true);
    expect(perms.voidOrder).toBe(true);
    expect(perms.refundOrder).toBe(false);
    expect(perms.payOrder).toBe(true);
    expect(perms.manageMenu).toBe(true);
    expect(perms.manageTables).toBe(false);
  });

  it('each permission field is independently correct', () => {
    mockGetMe.mockReturnValue(
      makeMe({
        createOrder: false,
        updateOrder: true,
        deleteOrderItem: false,
        voidOrder: true,
        refundOrder: false,
        payOrder: true,
        manageMenu: false,
        manageTables: true,
        managePrinters: false,
        manageUsers: true,
        manageSettings: false,
      }),
    );

    const perms = usePermissions();

    expect(perms.createOrder).toBe(false);
    expect(perms.updateOrder).toBe(true);
    expect(perms.deleteOrderItem).toBe(false);
    expect(perms.voidOrder).toBe(true);
    expect(perms.refundOrder).toBe(false);
    expect(perms.payOrder).toBe(true);
    expect(perms.manageMenu).toBe(false);
    expect(perms.manageTables).toBe(true);
    expect(perms.managePrinters).toBe(false);
    expect(perms.manageUsers).toBe(true);
    expect(perms.manageSettings).toBe(false);
  });

  it('reflects updated getMe values on subsequent calls', () => {
    mockGetMe.mockReturnValue(makeMe({ payOrder: true }));
    let perms = usePermissions();
    expect(perms.payOrder).toBe(true);

    mockGetMe.mockReturnValue(makeMe({ payOrder: false }));
    perms = usePermissions();
    expect(perms.payOrder).toBe(false);
  });
});
