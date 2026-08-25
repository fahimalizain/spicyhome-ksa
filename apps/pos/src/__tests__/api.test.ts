import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal('localStorage', mockLocalStorage);

vi.mock('@spicyhome/client-ts', () => ({
  SpicyHomeClient: vi.fn().mockImplementation(() => ({
    auth: { login: vi.fn(), me: vi.fn(), listUsers: vi.fn() },
    menu: { listCategories: vi.fn(), listItems: vi.fn() },
    orders: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      addItem: vi.fn(),
      updateItem: vi.fn(),
      removeItem: vi.fn(),
      pay: vi.fn(),
      void: vi.fn(),
      refund: vi.fn(),
      getRefunds: vi.fn(),
      getEvents: vi.fn(),
      verifyEvents: vi.fn(),
      reprint: vi.fn(),
    },
    tables: { list: vi.fn() },
    printers: { list: vi.fn() },
  })),
}));

describe('api module', () => {
  let api: typeof import('../api');

  beforeEach(async () => {
    vi.resetModules();
    mockLocalStorage.clear();
    api = await import('../api');
  });

  it('constructs SpicyHomeClient with a baseUrl ending in /api', async () => {
    const { SpicyHomeClient } = await import('@spicyhome/client-ts');
    const mock = vi.mocked(SpicyHomeClient);
    expect(mock).toHaveBeenCalled();
    const opts = mock.mock.calls[mock.mock.calls.length - 1]?.[0];
    expect(opts?.baseUrl).toBe(`${window.location.origin}/api`);
    expect(opts?.baseUrl.endsWith('/api')).toBe(true);
  });

  it('setToken stores in localStorage', () => {
    api.setToken('test-jwt');
    expect(mockLocalStorage.getItem('spicyhome_token')).toBe('test-jwt');
  });

  it('getToken returns stored token', () => {
    api.setToken('test-jwt');
    expect(api.getToken()).toBe('test-jwt');
  });

  it('clearToken removes token', () => {
    api.setToken('test-jwt');
    api.clearToken();
    expect(api.getToken()).toBeNull();
  });

  it('isAuthenticated returns false with no token', () => {
    expect(api.isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns true with token', () => {
    api.setToken('test-jwt');
    expect(api.isAuthenticated()).toBe(true);
  });

  it('setMe and getMe round-trip', () => {
    const me = {
      id: 1,
      username: 'admin',
      name: 'Admin',
      roleName: 'admin',
      roleId: 1,
      isActive: true,
      manageMenu: true,
      manageUsers: true,
      createOrder: true,
      updateOrder: true,
      deleteOrderItem: false,
      voidOrder: false,
      refundOrder: false,
      payOrder: false,
      manageTables: false,
      managePrinters: false,
      manageSettings: false,
    };
    api.setMe(me);
    const stored = api.getMe();
    expect(stored).toEqual(me);
  });

  it('getMe returns null for invalid data', () => {
    mockLocalStorage.setItem('spicyhome_me', 'invalid json');
    expect(api.getMe()).toBeNull();
  });
});
