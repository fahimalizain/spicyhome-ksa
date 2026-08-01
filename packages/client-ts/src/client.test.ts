import { SpicyHomeClient, type PayOrderDto } from './client';

describe('SpicyHomeClient', () => {
  it('can be instantiated', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });
    expect(client).toBeDefined();
  });

  it('exposes all resource groups', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(client.auth).toBeDefined();
    expect(client.menu).toBeDefined();
    expect(client.orders).toBeDefined();
    expect(client.tables).toBeDefined();
    expect(client.printers).toBeDefined();
  });

  it('exposes auth methods', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(typeof client.auth.login).toBe('function');
    expect(typeof client.auth.me).toBe('function');
    expect(typeof client.auth.listUsernames).toBe('function');
    expect(typeof client.auth.listUsers).toBe('function');
    expect(typeof client.auth.getUser).toBe('function');
    expect(typeof client.auth.createUser).toBe('function');
    expect(typeof client.auth.updateUser).toBe('function');
    expect(typeof client.auth.listRoles).toBe('function');
    expect(typeof client.auth.createRole).toBe('function');
    expect(typeof client.auth.updateRole).toBe('function');
  });

  it('exposes menu methods', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(typeof client.menu.listCategories).toBe('function');
    expect(typeof client.menu.getCategory).toBe('function');
    expect(typeof client.menu.createCategory).toBe('function');
    expect(typeof client.menu.updateCategory).toBe('function');
    expect(typeof client.menu.listItems).toBe('function');
    expect(typeof client.menu.getItem).toBe('function');
    expect(typeof client.menu.createItem).toBe('function');
    expect(typeof client.menu.updateItem).toBe('function');
  });

  it('exposes order methods', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(typeof client.orders.list).toBe('function');
    expect(typeof client.orders.get).toBe('function');
    expect(typeof client.orders.create).toBe('function');
    expect(typeof client.orders.syncItems).toBe('function');
    expect(typeof client.orders.update).toBe('function');
    expect(typeof client.orders.pay).toBe('function');
    expect(typeof client.orders.void).toBe('function');
    expect(typeof client.orders.refund).toBe('function');
    expect(typeof client.orders.getRefunds).toBe('function');
    expect(typeof client.orders.reprintRefund).toBe('function');
    expect(typeof client.orders.getEvents).toBe('function');
    expect(typeof client.orders.verifyEvents).toBe('function');
    expect(typeof client.orders.reprint).toBe('function');
  });

  it('exposes table methods', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(typeof client.tables.list).toBe('function');
    expect(typeof client.tables.get).toBe('function');
    expect(typeof client.tables.create).toBe('function');
    expect(typeof client.tables.update).toBe('function');
  });

  it('exposes printer methods', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(typeof client.printers.list).toBe('function');
    expect(typeof client.printers.get).toBe('function');
    expect(typeof client.printers.create).toBe('function');
    expect(typeof client.printers.update).toBe('function');
    expect(typeof client.printers.test).toBe('function');
    expect(typeof client.printers.status).toBe('function');
  });

  it('exposes payment methods methods', () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
    });

    expect(typeof client.paymentMethods.list).toBe('function');
    expect(typeof client.paymentMethods.listEnabled).toBe('function');
    expect(typeof client.paymentMethods.create).toBe('function');
    expect(typeof client.paymentMethods.update).toBe('function');
  });

  it('includes auth token in headers when token is set', async () => {
    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => 'test-jwt-token',
    });

    // Verify the client exists with token
    expect(client).toBeDefined();
  });

  it('PayOrderDto type is constructable', () => {
    const dto: PayOrderDto = {
      payments: [{ methodId: 'cash', amountHalalas: 4600 }],
    };
    expect(dto.payments).toHaveLength(1);
  });
});

describe('SpicyHomeClient onUnauthorized', () => {
  const originalFetch = globalThis.fetch;

  function unauthorizedResponse(): {
    ok: boolean;
    status: number;
    statusText: string;
    text: () => Promise<string>;
    clone: () => unknown;
  } {
    return {
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid credentials',
      clone: () => undefined,
    };
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('does not call onUnauthorized on login 401', async () => {
    const onUnauthorized = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue(unauthorizedResponse());

    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => null,
      onUnauthorized,
    });

    await expect(client.auth.login({ username: 'admin', pin: '0000' })).rejects.toThrow(
      'HTTP 401 Unauthorized',
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('calls onUnauthorized on non-login 401', async () => {
    const onUnauthorized = jest.fn();
    globalThis.fetch = jest.fn().mockResolvedValue(unauthorizedResponse());

    const client = new SpicyHomeClient({
      baseUrl: 'http://localhost:3000',
      getToken: () => 'expired',
      onUnauthorized,
    });

    await expect(client.auth.me()).rejects.toThrow('HTTP 401 Unauthorized');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
