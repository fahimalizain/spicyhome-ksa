import { createHash } from 'crypto';
import { orderAuditLog } from '@spicyhome/db';
import { eq, desc } from 'drizzle-orm';

export class AuditLogService {
  private getLastHash(tx: any, orderId: number): string {
    const lastLog = tx
      .select({ hash: orderAuditLog.hash })
      .from(orderAuditLog)
      .where(eq(orderAuditLog.orderId, orderId))
      .orderBy(desc(orderAuditLog.id))
      .limit(1)
      .get();
    return lastLog?.hash ?? '';
  }

  private computeHash(
    orderId: number,
    userId: number,
    action: string,
    payload: string,
    prevHash: string,
    createdAt: number,
  ): string {
    const input = `${orderId}|${userId}|${action}|${payload}|${prevHash}|${createdAt}`;
    return createHash('sha256').update(input).digest('hex');
  }

  createEntry(
    tx: any,
    orderId: number,
    userId: number,
    action: string,
    payload: Record<string, unknown>,
    createdAt: number,
  ): { prevHash: string; hash: string } {
    const prevHash = this.getLastHash(tx, orderId);
    const payloadJson = JSON.stringify(payload);
    const hash = this.computeHash(orderId, userId, action, payloadJson, prevHash, createdAt);
    tx
      .insert(orderAuditLog)
      .values({
        orderId,
        userId,
        action,
        payload: payloadJson,
        prevHash,
        hash,
        createdAt,
      })
      .run();
    return { prevHash, hash };
  }

  getLogs(tx: any, orderId: number): any[] {
    return tx
      .select()
      .from(orderAuditLog)
      .where(eq(orderAuditLog.orderId, orderId))
      .orderBy(orderAuditLog.id)
      .all();
  }

  verifyChain(orderId: number, entries: any[]): { valid: boolean; expectedHash?: string; gotHash?: string; index?: number } {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const expectedPrevHash = i === 0 ? '' : entries[i - 1].hash;
      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, expectedHash: expectedPrevHash, gotHash: entry.prevHash, index: i };
      }
      const expectedHash = this.computeHash(
        entry.orderId,
        entry.userId,
        entry.action,
        entry.payload,
        entry.prevHash,
        entry.createdAt,
      );
      if (entry.hash !== expectedHash) {
        return { valid: false, expectedHash, gotHash: entry.hash, index: i };
      }
    }
    return { valid: true };
  }
}
