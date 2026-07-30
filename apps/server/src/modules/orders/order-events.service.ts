import { createHash } from 'crypto';
import { orderEvents } from '@spicyhome/db';
import { eq, desc, sql } from 'drizzle-orm';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderEventsService {
  private computeHash(
    orderId: number,
    eventIdx: number,
    userId: number,
    type: string,
    payload: string,
    prevHash: string,
    createdAt: number,
  ): string {
    const input = `${orderId}|${eventIdx}|${userId}|${type}|${payload}|${prevHash}|${createdAt}`;
    return createHash('sha256').update(input).digest('hex');
  }

  createEvent(
    tx: any,
    orderId: number,
    userId: number,
    type: string,
    payload: Record<string, unknown>,
    createdAt: number,
  ): { id: number; eventIdx: number; prevHash: string; hash: string } {
    // Get the max eventIdx for this order
    const lastEvent = tx
      .select({ eventIdx: orderEvents.eventIdx })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.eventIdx))
      .limit(1)
      .get();
    const eventIdx = (lastEvent?.eventIdx ?? 0) + 1;

    // Get the previous event's hash
    const lastHash = tx
      .select({ hash: orderEvents.hash })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.eventIdx))
      .limit(1)
      .get();
    const prevHash = lastHash?.hash ?? '';

    const payloadJson = JSON.stringify(payload);
    const hash = this.computeHash(
      orderId,
      eventIdx,
      userId,
      type,
      payloadJson,
      prevHash,
      createdAt,
    );

    const result = tx
      .insert(orderEvents)
      .values({
        orderId,
        eventIdx,
        userId,
        type,
        payload: payloadJson,
        prevHash,
        hash,
        createdAt,
      })
      .run();

    return { id: Number(result.lastInsertRowid), eventIdx, prevHash, hash };
  }

  getEvents(tx: any, orderId: number): any[] {
    return tx
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(orderEvents.eventIdx)
      .all();
  }

  verifyChain(_orderId: number, entries: any[]): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const expectedPrevHash = i === 0 ? '' : entries[i - 1].hash;
      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAt: entry.eventIdx };
      }
      const expectedHash = this.computeHash(
        entry.orderId,
        entry.eventIdx,
        entry.userId,
        entry.type,
        entry.payload,
        entry.prevHash,
        entry.createdAt,
      );
      if (entry.hash !== expectedHash) {
        return { valid: false, brokenAt: entry.eventIdx };
      }
    }
    return { valid: true };
  }

  getPrintedQty(tx: any, orderItemId: number): number {
    const rows = tx
      .select({ type: orderEvents.type, payload: orderEvents.payload })
      .from(orderEvents)
      .where(sql`${orderEvents.type} IN ('item_added', 'item_updated')`)
      .all() as Array<{ type: string; payload: string }>;

    let total = 0;
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload);
        if (payload.orderItemId === orderItemId) {
          total += typeof payload.kitchenPrintedQty === 'number' ? payload.kitchenPrintedQty : 0;
        }
      } catch {
        // Ignore malformed JSON — treat as 0
      }
    }
    return total;
  }
}
