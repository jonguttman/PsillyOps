'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StartProductionModal } from '@/components/production/StartProductionModal';
import { toast } from 'sonner';

interface ProductionOrderActionsProps {
  orderId: string;
  orderNumber: string;
  productName: string;
  quantityToMake: number;
  status: string;
  currentAssignee?: { id: string; name: string | null } | null;
  canStart: boolean;
  canComplete: boolean;
  canBlock: boolean;
}

export function ProductionOrderActions({
  orderId,
  orderNumber,
  productName,
  quantityToMake,
  status,
  currentAssignee,
  canStart,
  canComplete,
  canBlock,
}: ProductionOrderActionsProps) {
  const router = useRouter();
  const [showStartModal, setShowStartModal] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleStart = async (assignToUserId?: string) => {
    const res = await fetch(`/api/production-orders/${orderId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignToUserId }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Failed to start production');
    }

    const data = await res.json();
    toast.success(`Production started! Created ${data.batchCount} batch(es).`);
    router.refresh();
  };

  const handleBlock = async () => {
    if (!blockReason.trim()) {
      toast.error('Please provide a reason for blocking');
      return;
    }

    setIsBlocking(true);
    try {
      const res = await fetch(`/api/production-orders/${orderId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: blockReason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to block production');
      }

      toast.success('Production order blocked');
      setShowBlockForm(false);
      setBlockReason('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to block production');
    } finally {
      setIsBlocking(false);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      const res = await fetch(`/api/production-orders/${orderId}/complete`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to complete production');
      }

      toast.success('Production order completed!');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete production');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        {canStart && (
          <button
            onClick={() => setShowStartModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Start Production
          </button>
        )}

        {canComplete && (
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {isCompleting ? 'Completing...' : 'Complete Order'}
          </button>
        )}

        {canBlock && !showBlockForm && (
          <button
            onClick={() => setShowBlockForm(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Block
          </button>
        )}
      </div>

      {/* Block Form */}
      {showBlockForm && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="text-sm font-medium text-red-800 mb-2">Block Production Order</h4>
          <textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Reason for blocking (e.g., material shortage, QC issue)"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm"
            rows={2}
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleBlock}
              disabled={isBlocking}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isBlocking ? 'Blocking...' : 'Confirm Block'}
            </button>
            <button
              onClick={() => {
                setShowBlockForm(false);
                setBlockReason('');
              }}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Start Modal */}
      {showStartModal && (
        <StartProductionModal
          orderId={orderId}
          orderNumber={orderNumber}
          productName={productName}
          quantityToMake={quantityToMake}
          currentAssignee={currentAssignee}
          onStart={handleStart}
          onClose={() => setShowStartModal(false)}
        />
      )}
    </>
  );
}

