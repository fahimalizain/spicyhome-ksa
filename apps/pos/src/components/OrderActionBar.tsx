import { useState } from 'react';
import { client } from '../api';
import { usePermissions } from '../hooks/usePermissions';

interface OrderActionBarProps {
  orderId: number;
  status: string; // 'open' | 'paid' | 'voided' | 'refunded'
}

export function OrderActionBar({ orderId, status }: OrderActionBarProps) {
  const permissions = usePermissions();
  const [reprintReceiptLoading, setReprintReceiptLoading] = useState(false);
  const [reprintKitchenLoading, setReprintKitchenLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!permissions.updateOrder) return null;

  const showReprintReceipt = status === 'paid' || status === 'refunded';
  const showReprintKitchen = status === 'open' || status === 'paid' || status === 'refunded';

  if (!showReprintReceipt && !showReprintKitchen) return null;

  async function handleReprint(target: 'receipt' | 'kitchen') {
    setError('');
    setSuccess('');

    if (target === 'receipt') setReprintReceiptLoading(true);
    else setReprintKitchenLoading(true);

    try {
      await client.orders.reprint(orderId, { target });
      setSuccess(`${target === 'receipt' ? 'Receipt' : 'Kitchen ticket'} reprinted`);
    } catch (e: any) {
      setError(e.message || 'Reprint failed');
    } finally {
      if (target === 'receipt') setReprintReceiptLoading(false);
      else setReprintKitchenLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        {showReprintReceipt && (
          <button
            onClick={() => handleReprint('receipt')}
            disabled={reprintReceiptLoading}
            className="touch-target px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-xs text-gray-300"
          >
            {reprintReceiptLoading ? 'Reprinting...' : 'Reprint Receipt'}
          </button>
        )}
        {showReprintKitchen && (
          <button
            onClick={() => handleReprint('kitchen')}
            disabled={reprintKitchenLoading}
            className="touch-target px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-xs text-gray-300"
          >
            {reprintKitchenLoading ? 'Reprinting...' : 'Reprint Kitchen'}
          </button>
        )}
      </div>
      {error && <div className="text-red-400 text-xs">{error}</div>}
      {success && <div className="text-green-400 text-xs">{success}</div>}
    </div>
  );
}
