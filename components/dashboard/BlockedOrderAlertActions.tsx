'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, RotateCcw, X, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface BlockedOrder {
  id: string;
  orderNumber: string;
  product: { name: string };
}

interface BlockedOrderAlertActionsProps {
  blockedOrders: BlockedOrder[];
}

export default function BlockedOrderAlertActions({ blockedOrders }: BlockedOrderAlertActionsProps) {
  const router = useRouter();
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showUnblockModal, setShowUnblockModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<BlockedOrder | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (blockedOrders.length === 0) {
    return null;
  }

  const handleArchiveClick = (order: BlockedOrder) => {
    setSelectedOrder(order);
    setArchiveReason('');
    setError(null);
    setShowArchiveModal(true);
  };

  const handleUnblockClick = (order: BlockedOrder) => {
    setSelectedOrder(order);
    setError(null);
    setShowUnblockModal(true);
  };

  const handleArchive = async () => {
    if (!selectedOrder || !archiveReason.trim()) {
      setError('Please provide a reason for archiving');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/production-orders/${selectedOrder.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: archiveReason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to archive order');
      }

      setShowArchiveModal(false);
      setSelectedOrder(null);
      setArchiveReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblock = async () => {
    if (!selectedOrder) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/production-orders/${selectedOrder.id}/unblock`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to unblock order');
      }

      setShowUnblockModal(false);
      setSelectedOrder(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  return (
    <>
      <li className="py-2 border-b border-gray-100 last:border-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
            <span className="text-sm text-gray-700">
              <strong>{blockedOrders.length}</strong> production order{blockedOrders.length !== 1 ? 's' : ''} blocked
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ops/production"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View All
            </Link>
            <button
              onClick={() => toggleExpand('blocked-orders')}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              {expandedOrderId === 'blocked-orders' ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Expanded Order List with Actions */}
        {expandedOrderId === 'blocked-orders' && (
          <div className="mt-3 ml-4 space-y-2">
            {blockedOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/ops/production/${order.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {order.orderNumber}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">{order.product.name}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleUnblockClick(order)}
                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                    title="Return to Queue"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleArchiveClick(order)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Archive"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </li>

      {/* Unblock Confirmation Modal */}
      {showUnblockModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Return to Production Queue</h2>
              <button
                onClick={() => setShowUnblockModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-gray-600">
                Return <span className="font-semibold">{selectedOrder.orderNumber}</span> ({selectedOrder.product.name}) to the production queue?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                The order will be set back to PLANNED status and can be started again.
              </p>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowUnblockModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUnblock}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {isSubmitting ? 'Processing...' : 'Return to Queue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-red-200 bg-red-50 flex items-center justify-between rounded-t-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-red-900">Archive Blocked Order</h2>
              </div>
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setArchiveReason('');
                  setError(null);
                }}
                className="p-1 text-red-400 hover:text-red-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Warning Banner */}
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-800">
                      This action is permanent and cannot be undone.
                    </p>
                    <p className="text-sm text-red-700 mt-1">
                      Archived orders are removed from the dashboard and cannot be restored.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-gray-600 mb-4">
                Archive <span className="font-semibold">{selectedOrder.orderNumber}</span> ({selectedOrder.product.name})?
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for archiving <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  placeholder="e.g., Materials discontinued, Order no longer needed, Duplicate order..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                  required
                />
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowArchiveModal(false);
                  setArchiveReason('');
                  setError(null);
                }}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={isSubmitting || !archiveReason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <Archive className="w-4 h-4" />
                {isSubmitting ? 'Archiving...' : 'Archive Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

