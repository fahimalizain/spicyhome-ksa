import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule, JwtService } from '@nestjs/jwt';
import WebSocket from 'ws';
import { RealtimeModule } from './realtime.module';
import { RealtimeGateway } from './realtime.gateway';

let app: INestApplication;
let gateway: RealtimeGateway;
let jwtService: JwtService;
let eventEmitter: EventEmitter2;
let port: number;

function getWsUrl(token?: string): string {
  const base = `ws://127.0.0.1:${port}/ws`;
  return token ? `${base}?token=${token}` : base;
}

function createToken(userId = 1, username = 'testuser'): string {
  return jwtService.sign({ sub: userId, username });
}

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      JwtModule.register({
        secret: 'test-secret',
        signOptions: { expiresIn: '1h' },
      }),
      RealtimeModule,
    ],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useWebSocketAdapter(new WsAdapter(app));

  gateway = moduleFixture.get(RealtimeGateway);
  jwtService = moduleFixture.get(JwtService);
  eventEmitter = moduleFixture.get(EventEmitter2);

  await app.listen(0);
  const addr = app.getHttpServer().address();
  port = addr.port;
});

afterAll(async () => {
  await app.close();
});

function connect(token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(getWsUrl(token));
    let settled = false;
    ws.on('open', () => {
      // Wait briefly to see if the server closes the connection (auth failure)
      setTimeout(() => {
        if (!settled && ws.readyState === WebSocket.OPEN) {
          settled = true;
          resolve(ws);
        }
      }, 200);
    });
    ws.on('close', (code: number) => {
      if (!settled) {
        settled = true;
        if (code === 4001 || code === 4002) {
          reject(new Error(`Auth rejected with code ${code}`));
        } else {
          reject(new Error(`Connection closed with code ${code}`));
        }
      }
    });
    ws.on('error', (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    ws.on('unexpected-response', (_req, res) => {
      if (!settled) {
        settled = true;
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Connection timeout'));
      }
    }, 5000);
  });
}

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), timeoutMs);
    ws.once('message', (data: WebSocket.Data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe('RealtimeGateway', () => {
  describe('auth', () => {
    it('rejects connection without token', async () => {
      await expect(connect()).rejects.toThrow();
    });

    it('rejects connection with invalid token', async () => {
      await expect(connect('bad-token')).rejects.toThrow();
    });

    it('accepts connection with valid token', async () => {
      const token = createToken();
      const ws = await connect(token);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('tracks connected client count', async () => {
      const token = createToken(2, 'countuser');
      const ws = await connect(token);
      expect(gateway.getConnectedCount()).toBeGreaterThanOrEqual(1);
      ws.close();
      // Wait for close event to propagate
      await new Promise((r) => setTimeout(r, 100));
    });
  });

  describe('broadcast', () => {
    it('receives order.created event', async () => {
      const token = createToken(3, 'orderuser');
      const ws = await connect(token);

      // Small delay to ensure connection is registered
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('order.created', { orderId: 42, userId: 3 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('order.created');
      expect(msg.payload.orderId).toBe(42);
      expect(msg.payload.userId).toBe(3);
      expect(typeof msg.at).toBe('number');

      ws.close();
    });

    it('receives order.sent event', async () => {
      const token = createToken(4, 'sentuser');
      const ws = await connect(token);
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('order.sent', { orderId: 100, userId: 4 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('order.sent');
      expect(msg.payload.orderId).toBe(100);

      ws.close();
    });

    it('receives order.paid event', async () => {
      const token = createToken(5, 'paiduser');
      const ws = await connect(token);
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('order.paid', { orderId: 200, userId: 5 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('order.paid');
      expect(msg.payload.orderId).toBe(200);

      ws.close();
    });

    it('receives order.voided event', async () => {
      const token = createToken(6, 'voiduser');
      const ws = await connect(token);
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('order.voided', { orderId: 300, userId: 6 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('order.voided');

      ws.close();
    });

    it('receives order.item.added event', async () => {
      const token = createToken(7, 'itemuser');
      const ws = await connect(token);
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('order.item.added', { orderId: 400, userId: 7, itemId: 10, qty: 2 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('order.item.added');
      expect(msg.payload.itemId).toBe(10);
      expect(msg.payload.qty).toBe(2);

      ws.close();
    });

    it('receives table.created event', async () => {
      const token = createToken(8, 'tableuser');
      const ws = await connect(token);
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('table.created', { tableId: 5, userId: 8 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('table.created');
      expect(msg.payload.tableId).toBe(5);

      ws.close();
    });

    it('broadcasts to multiple clients', async () => {
      const token1 = createToken(9, 'multi1');
      const token2 = createToken(10, 'multi2');
      const ws1 = await connect(token1);
      const ws2 = await connect(token2);
      await new Promise((r) => setTimeout(r, 50));

      eventEmitter.emit('order.created', { orderId: 500, userId: 9 });

      const msg1 = await waitForMessage(ws1);
      const msg2 = await waitForMessage(ws2);

      expect(msg1.type).toBe('order.created');
      expect(msg2.type).toBe('order.created');
      expect(msg1.payload.orderId).toBe(500);
      expect(msg2.payload.orderId).toBe(500);

      ws1.close();
      ws2.close();
    });

    it('does not receive unrelated events', async () => {
      const token = createToken(11, 'unrelated');
      const ws = await connect(token);
      await new Promise((r) => setTimeout(r, 50));

      // Emit an event the gateway doesn't listen to
      eventEmitter.emit('random.event', { foo: 'bar' });

      // Emit a valid event to ensure connection still works
      eventEmitter.emit('order.sent', { orderId: 600, userId: 11 });

      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('order.sent');

      ws.close();
    });
  });
});
