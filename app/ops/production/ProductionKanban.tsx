'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/formatters';
import { Archive, Eye, EyeOff, X } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 border-gray-300',
  IN_PROGRESS: 'bg-blue-50 border-blue-300',
  BLOCKED: 'bg-red-50 border-red-300',
  COMPLETED: 'bg-green-50 border-green-300',
  CANCELLED: 'bg-gray-100 border-gray-200 opacity-50'
};

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

interface Order {
  id: string;
  orderNumber: string;
  quantityToMake: number;
  status: string;
  scheduledDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  dismissedAt: string | null;
  product: { id: string; name: string; sku: string };
  workCenter: { id: string; name: string } | null;
  batches: { id: string; batchCode: string; status: string; qcStatus: string; actualQuantity: number | null }[];
  materials: { shortage: number }[];
  _count: { batches: number };
}

export default function ProductionKanban() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [blockedCount, setBlockedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (showArchived) params.set('showArchived', 'true');
      if (showDismissed) params.set('showDismissed', 'true');
      
      const res = await fetch(`/api/production-orders?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      
      const data = await res.json();
      setOrders(data.orders);
      setBlockedCount(data.stats.blockedCount);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [showArchived, showDismissed]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleDismiss = async (orderId: string) => {
    setDismissingId(orderId);
    try {
      const res = await fetch(`/api/production-orders/${orderId}/dismiss`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to dismiss');
      await fetchOrders();
    } catch (error) {
      console.error('Error dismissing order:', error);
      alert('Failed to dismiss order');
    } finally {
      setDismissingId(null);
    }
  };

  // Group orders by status for Kanban
  const columns: Record<string, Order[]> = {
    PLANNED: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    COMPLETED: []
  };

  orders.forEach(order => {
    if (columns[order.status]) {
      columns[order.status].push(order);
    }
  });

  // Calculate stats
  const totalOrders = orders.length;
  const inProgressCount = columns.IN_PROGRESS.length;
  const completedThisWeek = columns.COMPLETED.filter(o => {
    const completed = o.completedAt;
    if (!completed) return false;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(completed) >= weekAgo;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Total Orders</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{totalOrders}</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4 border border-blue-200">
          <div className="text-sm font-medium text-blue-700">In Progress</div>
          <div className="mt-1 text-2xl font-semibold text-blue-900">{inProgressCount}</div>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 border border-red-200">
          <div className="text-sm font-medium text-red-700">Blocked</div>
          <div className="mt-1 text-2xl font-semibold text-red-900">{blockedCount}</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 border border-green-200">
          <div className="text-sm font-medium text-green-700">Completed (7d)</div>
          <div className="mt-1 text-2xl font-semibold text-green-900">{completedThisWeek}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white rounded-lg shadow px-4 py-3">
        <span className="text-sm font-medium text-gray-700">Show hidden:</span>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showArchived 
              ? 'bg-red-100 text-red-700 border border-red-300' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {showArchived ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Archived Blocked
        </button>
        <button
          onClick={() => setShowDismissed(!showDismissed)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showDismissed 
              ? 'bg-green-100 text-green-700 border border-green-300' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {showDismissed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          Old/Dismissed Completed
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {(['PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const).map(status => (
          <div key={status} className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">{STATUS_LABELS[status]}</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                {columns[status].length}
              </span>
            </div>
            <div className="space-y-3">
              {columns[status].map(order => {
                const hasShortage = order.materials.some(m => m.shortage > 0);
                const hasQCPending = order.batches.some(b => 
                  b.qcStatus === 'PENDING' || b.qcStatus === 'HOLD'
                );
                const totalProduced = order.batches.reduce(
                  (sum, b) => sum + (b.actualQuantity || 0), 0
                );
                const progress = order.quantityToMake > 0 
                  ? Math.round((totalProduced / order.quantityToMake) * 100)
                  : 0;
                const isArchived = !!order.archivedAt;
                const isDismissed = !!order.dismissedAt;
                const isOld = order.completedAt && 
                  new Date(order.completedAt) < new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

                return (
                  <div
                    key={order.id}
                    className={`relative bg-white rounded-lg border-2 p-4 transition-shadow ${STATUS_COLORS[status]} ${
                      isArchived || isDismissed || isOld ? 'opacity-60' : ''
                    }`}
                  >
                    <Link
                      href={`/ops/production/${order.id}`}
                      className="block hover:opacity-80"
                    >
                      <div className="flex items-start justify-between">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {order.product.name}
                        </div>
                        {order.workCenter && (
                          <span className="ml-2 text-xs text-gray-500 shrink-0">
                            {order.workCenter.name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {order.orderNumber}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-gray-600">
                          {totalProduced} / {order.quantityToMake}
                        </span>
                        {status !== 'COMPLETED' && (
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-blue-600 h-1.5 rounded-full" 
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {order.scheduledDate && (
                        <div className="mt-2 text-xs text-gray-500">
                          Scheduled: {formatDate(order.scheduledDate)}
                        </div>
                      )}
                      {/* Status Tags */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {isArchived && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                            <Archive className="w-3 h-3 mr-0.5" />
                            Archived
                          </span>
                        )}
                        {isDismissed && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                            Dismissed
                          </span>
                        )}
                        {isOld && !isDismissed && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600">
                            &gt;15 days
                          </span>
                        )}
                        {hasShortage && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                            Shortage
                          </span>
                        )}
                        {hasQCPending && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                            QC Pending
                          </span>
                        )}
                        {order._count.batches > 0 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            {order._count.batches} batch{order._count.batches !== 1 ? 'es' : ''}
                          </span>
                        )}
                      </div>
                    </Link>
                    
                    {/* Dismiss button for completed orders */}
                    {status === 'COMPLETED' && !isDismissed && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDismiss(order.id);
                        }}
                        disabled={dismissingId === order.id}
                        className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Dismiss from board"
                      >
                        {dismissingId === order.id ? (
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              {columns[status].length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">
                  No orders
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

