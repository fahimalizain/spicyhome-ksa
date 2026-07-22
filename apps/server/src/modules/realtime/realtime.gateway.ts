import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Server, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { WS_EVENTS } from '@spicyhome/shared';
import type { WsMessage } from '@spicyhome/shared';

interface AuthenticatedSocket extends WebSocket {
  userId?: number;
  username?: string;
}

@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private clients = new Set<AuthenticatedSocket>();

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: AuthenticatedSocket, request: IncomingMessage): void {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      const token = url.searchParams.get('token');

      if (!token) {
        this.logger.warn('WebSocket connection rejected: missing token');
        client.close(4001, 'Missing token');
        return;
      }

      const payload = this.jwtService.verify(token);
      client.userId = payload.sub;
      client.username = payload.username;
      this.clients.add(client);

      this.logger.log(`WebSocket client connected: ${payload.username} (id=${payload.sub})`);

      client.on('close', () => {
        this.clients.delete(client);
        this.logger.log(`WebSocket client disconnected: ${payload.username}`);
      });
    } catch (err: any) {
      this.logger.warn(`WebSocket connection rejected: ${err.message}`);
      client.close(4002, 'Invalid token');
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.clients.delete(client);
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  @OnEvent(WS_EVENTS.ORDER_CREATED)
  handleOrderCreated(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.ORDER_CREATED, payload, at: Math.floor(Date.now() / 1000) });
  }

  @OnEvent(WS_EVENTS.ORDER_UPDATED)
  handleOrderUpdated(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.ORDER_UPDATED, payload, at: Math.floor(Date.now() / 1000) });
  }

  @OnEvent(WS_EVENTS.ORDER_SENT)
  handleOrderSent(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.ORDER_SENT, payload, at: Math.floor(Date.now() / 1000) });
  }

  @OnEvent(WS_EVENTS.ORDER_PAID)
  handleOrderPaid(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.ORDER_PAID, payload, at: Math.floor(Date.now() / 1000) });
  }

  @OnEvent(WS_EVENTS.ORDER_VOIDED)
  handleOrderVoided(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.ORDER_VOIDED, payload, at: Math.floor(Date.now() / 1000) });
  }

  @OnEvent(WS_EVENTS.ORDER_ITEM_ADDED)
  handleOrderItemAdded(payload: Record<string, unknown>): void {
    this.broadcast({
      type: WS_EVENTS.ORDER_ITEM_ADDED,
      payload,
      at: Math.floor(Date.now() / 1000),
    });
  }

  @OnEvent(WS_EVENTS.ORDER_ITEM_UPDATED)
  handleOrderItemUpdated(payload: Record<string, unknown>): void {
    this.broadcast({
      type: WS_EVENTS.ORDER_ITEM_UPDATED,
      payload,
      at: Math.floor(Date.now() / 1000),
    });
  }

  @OnEvent(WS_EVENTS.ORDER_ITEM_REMOVED)
  handleOrderItemRemoved(payload: Record<string, unknown>): void {
    this.broadcast({
      type: WS_EVENTS.ORDER_ITEM_REMOVED,
      payload,
      at: Math.floor(Date.now() / 1000),
    });
  }

  @OnEvent(WS_EVENTS.TABLE_CREATED)
  handleTableCreated(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.TABLE_CREATED, payload, at: Math.floor(Date.now() / 1000) });
  }

  @OnEvent(WS_EVENTS.TABLE_UPDATED)
  handleTableUpdated(payload: Record<string, unknown>): void {
    this.broadcast({ type: WS_EVENTS.TABLE_UPDATED, payload, at: Math.floor(Date.now() / 1000) });
  }

  getConnectedCount(): number {
    return this.clients.size;
  }
}
