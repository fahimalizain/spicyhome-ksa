import { useState } from 'react';
import { client } from '../api';
import { usePermissions } from '../hooks/usePermissions';

interface OrderActionBarProps {
  orderId: number;
  status: string; // 'open' | 'paid' | 'voided' | 'refunded'
  className?: string;
}

export function OrderActionBar({ orderId, status, className = '' }: OrderActionBarProps) {
  const permissions = usePermissions();
  const [reprintReceiptLoading, setReprintReceiptLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!permissions.updateOrder) return null;

  const showReprintReceipt = status === 'paid' || status === 'refunded';

  if (!showReprintReceipt) return null;

  async function handleReprint() {
    setError('');
    setSuccess('');
    setReprintReceiptLoading(true);

    try {
      await client.orders.reprint(orderId, { target: 'receipt' });
      setSuccess('Receipt reprinted');
    } catch (e: any) {
      setError(e.message || 'Reprint failed');
    } finally {
      setReprintReceiptLoading(false);
    }
  }

  return (
    <div className={className ? `space-y-1 ${className}` : 'space-y-1'}>
      <button
        onClick={handleReprint}
        disabled={reprintReceiptLoading}
        className="w-full touch-target bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-gray-300 py-3"
      >
        {reprintReceiptLoading ? 'Reprinting...' : 'Reprint Receipt'}
      </button>
      {error && <div className="text-red-400 text-xs">{error}</div>}
      {success && <div className="text-green-400 text-xs">{success}</div>}
    </div>
  );
}
