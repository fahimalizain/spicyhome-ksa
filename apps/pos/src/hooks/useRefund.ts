import { useState, useCallback } from 'react';
import { client } from '../api';
import type { RefundResponse, OrderRefundResponse } from '@spicyhome/client-ts';

export function getRemainingQty(
  originalQty: number,
  orderItemId: number,
  refunds: OrderRefundResponse[],
): number {
  const alreadyRefunded = refunds.reduce((sum, refund) => {
    const match = (refund.items || []).find(
      (ri: { orderItemId: number; qty: number }) => ri.orderItemId === orderItemId,
    );
    return sum + (match ? match.qty : 0);
  }, 0);
  return Math.max(0, originalQty - alreadyRefunded);
}

export function useRefund() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refund = useCallback(
    async (
      orderId: number,
      items: { orderItemId: number; qty: number }[],
      methodId: string,
      reason?: string,
    ): Promise<{ ok: false } | { ok: true; refundId: number }> => {
      setLoading(true);
      setError('');
      try {
        const result: RefundResponse = await client.orders.refund(orderId, {
          items,
          methodId,
          ...(reason ? { reason } : {}),
        });
        return { ok: true, refundId: result.refundId };
      } catch (e: any) {
        setError(e.message || 'Refund failed');
        return { ok: false };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, refund };
}
