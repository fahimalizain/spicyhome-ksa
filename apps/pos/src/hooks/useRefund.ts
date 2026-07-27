import { useState, useCallback } from 'react';
import { client } from '../api';
import type { OrderRefundResponse } from '@spicyhome/client-ts';

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
      reason?: string,
    ): Promise<boolean> => {
      setLoading(true);
      setError('');
      try {
        await client.orders.refund(orderId, {
          items,
          ...(reason ? { reason } : {}),
        });
        return true;
      } catch (e: any) {
        setError(e.message || 'Refund failed');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, refund };
}
