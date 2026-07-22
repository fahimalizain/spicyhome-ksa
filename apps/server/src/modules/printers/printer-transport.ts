import * as net from 'net';

export interface PrinterTransport {
  send(ip: string, port: number, data: Buffer, timeoutMs?: number): Promise<void>;
  check(ip: string, port: number, timeoutMs?: number): Promise<boolean>;
}

export class PrinterUnreachableError extends Error {
  constructor(
    message: string,
    public readonly printerName: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'PrinterUnreachableError';
  }
}

export class TcpPrinterTransport implements PrinterTransport {
  async send(ip: string, port: number, data: Buffer, timeoutMs = 3000): Promise<void> {
    await this.sendWithRetry(ip, port, data, timeoutMs, 1);
  }

  private sendWithRetry(
    ip: string,
    port: number,
    data: Buffer,
    timeoutMs: number,
    remainingRetries: number,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) {
          if (remainingRetries > 0) {
            // Retry after a short delay
            this.sendWithRetry(ip, port, data, timeoutMs, remainingRetries - 1)
              .then(resolve)
              .catch(reject);
          } else {
            reject(err);
          }
        } else {
          resolve();
        }
      };

      // Warn: this uses the host Node (>= 20) socket API. On Node 18,
      // socket.connect() with options object works identically.
      socket.on('error', (e: Error) => finish(e));
      socket.on('timeout', () => finish(new Error(`Connection timed out after ${timeoutMs}ms`)));

      socket.connect(port, ip, () => {
        socket.write(data, (writeErr?: Error) => {
          if (writeErr) {
            finish(writeErr);
            return;
          }
          // Allow a small window for data to flush
          socket.end(() => finish());
        });
      });

      socket.setTimeout(timeoutMs);
    });
  }

  async check(ip: string, port: number, timeoutMs = 3000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const cleanup = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(result);
      };

      socket.on('error', () => cleanup(false));
      socket.on('timeout', () => cleanup(false));

      socket.connect(port, ip, () => cleanup(true));
      socket.setTimeout(timeoutMs);
    });
  }
}

/**
 * Fake transport for tests — records sent data instead of opening TCP sockets.
 */
export class FakePrinterTransport implements PrinterTransport {
  sent: Array<{ ip: string; port: number; data: Buffer }> = [];
  reachable = new Map<string, boolean>();
  /** If set, throw this error on send. */
  nextError: Error | null = null;

  async send(ip: string, port: number, data: Buffer): Promise<void> {
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    this.sent.push({ ip, port, data });
  }

  async check(ip: string, port: number): Promise<boolean> {
    const key = `${ip}:${port}`;
    return this.reachable.get(key) ?? true;
  }
}
