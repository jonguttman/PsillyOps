'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, AlertCircle, ExternalLink, ChevronDown } from 'lucide-react';
import { PurchaseOrderStatus } from '@prisma/client';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  vendor: { id: string; name: string };
  createdBy: { id: string; name: string };
  expectedDeliveryDate: string | null;
  createdAt: string;
  lineItemCount: number;
  totalValue: number;
  receivedPercentage: number;
}

interface Vendor {
  id: string;
  name: string;
}

interface Filters {
  status?: PurchaseOrderStatus;
  vendorId?: string;
}

interface PurchaseOrdersClientProps {
  initialPurchaseOrders: PurchaseOrder[];
  initialTotal: number;
  vendors: Vendor[];
}

const STATUS_OPTIONS: { value: PurchaseOrderStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PARTIALLY_RECEIVED', label: 'Partially Received' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function getStatusBadgeColor(status: PurchaseOrderStatus): string {
  const colors: Record<PurchaseOrderStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    SENT: 'bg-blue-100 text-blue-700',
    PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
    RECEIVED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };
  return colors[status];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function PurchaseOrdersClient({
  initialPurchaseOrders,
  initialTotal,
  vendors,
}: PurchaseOrdersClientProps) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialPurchaseOrders);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [offset, setOffset] = useState(0);

  const PAGE_SIZE = 50;

  const fetchPurchaseOrders = useCallback(async (newOffset: number = 0) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(newOffset));

      if (filters.status) {
        params.set('status', filters.status);
      }
      if (filters.vendorId) {
        params.set('vendorId', filters.vendorId);
      }

      const res = await fetch(`/api/purchase-orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch purchase orders');
      }

      const data = await res.json();
      
      // Transform the data to match our interface
      const transformed = data.purchaseOrders.map((po: any) => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        vendor: po.vendor,
        createdBy: po.createdBy,
        expectedDeliveryDate: po.expectedDeliveryDate,
        createdAt: po.createdAt,
        lineItemCount: po.lineItems.length,
        totalValue: po.lineItems.reduce(
          (sum: number, li: any) => sum + li.quantityOrdered * (li.unitCost || 0),
          0
        ),
        receivedPercentage: po.lineItems.length > 0
          ? Math.round(
              (po.lineItems.reduce((sum: number, li: any) => sum + li.quantityReceived, 0) /
                po.lineItems.reduce((sum: number, li: any) => sum + li.quantityOrdered, 0)) *
                100
            )
          : 0,
      }));

      setPurchaseOrders(transformed);
      setTotal(data.total);
      setOffset(newOffset);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPurchaseOrders(0);
  }, [fetchPurchaseOrders]);

  const handleRefresh = () => {
    fetchPurchaseOrders(0);
  };

  const handleLoadMore = () => {
    fetchPurchaseOrders(offset + PAGE_SIZE);
  };

  const hasMore = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4">
          {/* Status Filter */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  status: e.target.value as PurchaseOrderStatus || undefined,
                })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Vendor
            </label>
            <select
              value={filters.vendorId || ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  vendorId: e.target.value || undefined,
                })
              }
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? (
            'Loading...'
          ) : (
            <>
              Showing {purchaseOrders.length} of {total} purchase orders
            </>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {purchaseOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">No purchase orders found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PO #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/ops/purchase-orders/${po.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">{po.vendor.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(
                          po.status
                        )}`}
                      >
                        {po.status.replace(/_/g, ' ')}
                      </span>
                      {/* Received progress for partial */}
                      {po.status === 'PARTIALLY_RECEIVED' && (
                        <div className="mt-1 w-24 bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full"
                            style={{ width: `${po.receivedPercentage}%` }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{po.lineItemCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900">
                        {po.totalValue > 0 ? formatCurrency(po.totalValue) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {po.expectedDeliveryDate
                          ? formatDate(po.expectedDeliveryDate)
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {formatDate(po.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/ops/purchase-orders/${po.id}`}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
          >
            <ChevronDown className="w-4 h-4" />
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}


