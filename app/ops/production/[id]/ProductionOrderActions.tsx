'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StartProductionModal } from '@/components/production/StartProductionModal';

interface Toast {
  type: 'success' | 'error' | 'warning';
  message: string;
}

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
  const [toast, setToast] = useState<Toast | null>(null);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message });
  };

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
    showToast('success', `Production started! Created ${data.batchCount} batch(es).`);
    router.refresh();
  };

  const handleBlock = async () => {
    if (!blockReason.trim()) {
      showToast('error', 'Please provide a reason for blocking');
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

      showToast('success', 'Production order blocked');
      setShowBlockForm(false);
      setBlockReason('');
      router.refresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to block production');
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

      showToast('success', 'Production order completed!');
      router.refresh();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to complete production');
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

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : toast.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-amber-500 text-white'
          }`}
          style={{ animation: 'slide-up 0.3s ease-out' }}
        >
          {toast.type === 'success' && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {toast.type === 'error' && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </>
  );
}

