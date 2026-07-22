import {
  FakePrinterTransport,
  TcpPrinterTransport,
  PrinterUnreachableError,
} from './printer-transport';
import * as net from 'net';

describe('FakePrinterTransport', () => {
  it('records sent data', async () => {
    const t = new FakePrinterTransport();
    const buf = Buffer.from('hello');
    await t.send('1.2.3.4', 9100, buf);
    expect(t.sent.length).toBe(1);
    expect(t.sent[0].ip).toBe('1.2.3.4');
    expect(t.sent[0].port).toBe(9100);
    expect(t.sent[0].data.toString()).toBe('hello');
  });

  it('throws nextError when set', async () => {
    const t = new FakePrinterTransport();
    t.nextError = new Error('boom');
    await expect(t.send('1.2.3.4', 9100, Buffer.from('hi'))).rejects.toThrow('boom');
    // Next call should work (error consumed)
    await t.send('1.2.3.4', 9100, Buffer.from('hi'));
    expect(t.sent.length).toBe(1);
  });

  it('check returns true by default', async () => {
    const t = new FakePrinterTransport();
    const result = await t.check('1.2.3.4', 9100);
    expect(result).toBe(true);
  });

  it('check respects reachable map', async () => {
    const t = new FakePrinterTransport();
    t.reachable.set('1.2.3.4:9100', false);
    const result = await t.check('1.2.3.4', 9100);
    expect(result).toBe(false);
  });
});

describe('TcpPrinterTransport', () => {
  it('can be instantiated', () => {
    const t = new TcpPrinterTransport();
    expect(t).toBeDefined();
  });

  it('check returns false for unreachable host', async () => {
    const t = new TcpPrinterTransport();
    // Use a non-routable IP with fast timeout
    const result = await t.check('192.0.2.99', 19999, 200);
    expect(result).toBe(false);
  });

  it('check returns true for a reachable listener', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as net.AddressInfo;

    try {
      const t = new TcpPrinterTransport();
      const result = await t.check('127.0.0.1', addr.port, 500);
      expect(result).toBe(true);
    } finally {
      server.close();
    }
  });

  it('send writes data to a real socket', async () => {
    const chunks: Buffer[] = [];
    const server = net.createServer((socket) => {
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => server.close());
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as net.AddressInfo;

    try {
      const t = new TcpPrinterTransport();
      const data = Buffer.from([0x1b, 0x40]);
      await t.send('127.0.0.1', addr.port, data, 1000);

      // Give data time to arrive via the callback
      await new Promise((r) => setTimeout(r, 100));

      const all = Buffer.concat(chunks);
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(all[0]).toBe(0x1b);
      expect(all[1]).toBe(0x40);
    } finally {
      server.close();
    }
  });

  it('send times out for no-response host', async () => {
    const t = new TcpPrinterTransport();
    // Should reject after timeout (~200ms + retry)
    await expect(t.send('192.0.2.99', 19999, Buffer.from('hi'), 200)).rejects.toThrow();
  });
});

describe('PrinterUnreachableError', () => {
  it('stores printer name', () => {
    const err = new PrinterUnreachableError('msg', 'Kitchen');
    expect(err.name).toBe('PrinterUnreachableError');
    expect(err.printerName).toBe('Kitchen');
    expect(err.message).toBe('msg');
  });

  it('wraps a cause error', () => {
    const cause = new Error('underlying');
    const err = new PrinterUnreachableError('fail', 'R1', cause);
    expect(err.cause).toBe(cause);
  });
});
