'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  Calendar,
  User,
} from 'lucide-react';
import { PurchaseOrderStatus } from '@prisma/client';

interface Material {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
}

interface LineItem {
  id: string;
  material: Material;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
}

interface Vendor {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  vendor: Vendor;
  createdBy: { id: string; name: string; email: string };
  expectedDeliveryDate: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
}

interface Location {
  id: string;
  name: string;
  isDefaultReceiving: boolean;
}

interface ActivityLog {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  user: { id: string; name: string } | null;
  details: Record<string, any> | null;
}

interface Props {
  purchaseOrder: PurchaseOrder;
  locations: Location[];
  activityLogs: ActivityLog[];
  canEdit: boolean;
}

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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export default function PurchaseOrderDetailClient({
  purchaseOrder,
  locations,
  activityLogs,
  canEdit,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [selectedLocation, setSelectedLocation] = useState(
    locations.find((l) => l.isDefaultReceiving)?.id || locations[0]?.id || ''
  );

  const canSubmit = purchaseOrder.status === 'DRAFT' && canEdit;
  const canReceive =
    (purchaseOrder.status === 'SENT' || purchaseOrder.status === 'PARTIALLY_RECEIVED') &&
    canEdit;

  const totalValue = purchaseOrder.lineItems.reduce(
    (sum, li) => sum + li.quantityOrdered * (li.unitCost || 0),
    0
  );

  const handleSubmit = async () => {
    if (!confirm('Submit this purchase order to the vendor?')) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/purchase-orders/${purchaseOrder.id}/submit`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to submit');
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = async () => {
    const items = Object.entries(receiveQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([lineItemId, quantityReceived]) => ({
        lineItemId,
        quantityReceived,
      }));

    if (items.length === 0) {
      setError('Please enter quantities to receive');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/purchase-orders/${purchaseOrder.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          items,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to receive items');
      }

      setShowReceiveModal(false);
      setReceiveQuantities({});
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/ops/purchase-orders"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {purchaseOrder.poNumber}
              </h1>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(
                  purchaseOrder.status
                )}`}
              >
                {purchaseOrder.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Created {formatDateTime(purchaseOrder.createdAt)} by{' '}
              {purchaseOrder.createdBy.name}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Submit to Vendor
            </button>
          )}
          {canReceive && (
            <button
              onClick={() => setShowReceiveModal(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Package className="w-4 h-4" />
              Receive Items
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Material
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      SKU
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Ordered
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Received
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Unit Cost
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchaseOrder.lineItems.map((item) => {
                    const isFullyReceived = item.quantityReceived >= item.quantityOrdered;
                    const isPartiallyReceived = item.quantityReceived > 0 && !isFullyReceived;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/materials/${item.material.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {item.material.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600">{item.material.sku}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-gray-900">
                            {item.quantityOrdered} {item.material.unitOfMeasure}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span
                              className={`text-sm ${
                                isFullyReceived
                                  ? 'text-green-600'
                                  : isPartiallyReceived
                                  ? 'text-amber-600'
                                  : 'text-gray-400'
                              }`}
                            >
                              {item.quantityReceived}
                            </span>
                            {isFullyReceived && (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-gray-600">
                            {item.unitCost ? formatCurrency(item.unitCost) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium text-gray-900">
                            {item.unitCost
                              ? formatCurrency(item.quantityOrdered * item.unitCost)
                              : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {totalValue > 0 ? formatCurrency(totalValue) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
            </div>
            <div className="p-4">
              {activityLogs.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                <ul className="space-y-4">
                  {activityLogs.map((log) => (
                    <li key={log.id} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Clock className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">{log.summary}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatTimeAgo(log.createdAt)}
                          {log.user && ` • ${log.user.name}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Vendor & Dates */}
        <div className="space-y-6">
          {/* Vendor Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              Vendor
            </h3>
            <div className="space-y-2">
              <Link
                href={`/vendors/${purchaseOrder.vendor.id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                {purchaseOrder.vendor.name}
              </Link>
              {purchaseOrder.vendor.contactName && (
                <p className="text-sm text-gray-600">{purchaseOrder.vendor.contactName}</p>
              )}
              {purchaseOrder.vendor.contactEmail && (
                <p className="text-sm text-gray-600">{purchaseOrder.vendor.contactEmail}</p>
              )}
              {purchaseOrder.vendor.contactPhone && (
                <p className="text-sm text-gray-600">{purchaseOrder.vendor.contactPhone}</p>
              )}
            </div>
          </div>

          {/* Dates Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              Timeline
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="text-sm text-gray-900">
                  {formatDateTime(purchaseOrder.createdAt)}
                </dd>
              </div>
              {purchaseOrder.sentAt && (
                <div>
                  <dt className="text-xs text-gray-500">Sent to Vendor</dt>
                  <dd className="text-sm text-gray-900">
                    {formatDateTime(purchaseOrder.sentAt)}
                  </dd>
                </div>
              )}
              {purchaseOrder.expectedDeliveryDate && (
                <div>
                  <dt className="text-xs text-gray-500">Expected Delivery</dt>
                  <dd className="text-sm text-gray-900">
                    {formatDate(purchaseOrder.expectedDeliveryDate)}
                  </dd>
                </div>
              )}
              {purchaseOrder.receivedAt && (
                <div>
                  <dt className="text-xs text-gray-500">Fully Received</dt>
                  <dd className="text-sm text-green-600 font-medium">
                    {formatDateTime(purchaseOrder.receivedAt)}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Created By */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              Created By
            </h3>
            <p className="text-sm text-gray-900">{purchaseOrder.createdBy.name}</p>
            <p className="text-sm text-gray-600">{purchaseOrder.createdBy.email}</p>
          </div>
        </div>
      </div>

      {/* Receive Modal */}
      {showReceiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Receive Items</h2>
              <p className="text-sm text-gray-600 mt-1">
                Enter quantities received for each item.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Location Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Receive to Location
                </label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} {loc.isDefaultReceiving ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items Table */}
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Material
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                      Ordered
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                      Already Received
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                      Receive Now
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchaseOrder.lineItems
                    .filter((item) => item.quantityReceived < item.quantityOrdered)
                    .map((item) => {
                      const remaining = item.quantityOrdered - item.quantityReceived;
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium text-gray-900">
                              {item.material.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {item.quantityOrdered}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            {item.quantityReceived}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              value={receiveQuantities[item.id] || ''}
                              onChange={(e) =>
                                setReceiveQuantities({
                                  ...receiveQuantities,
                                  [item.id]: Math.min(
                                    Number(e.target.value) || 0,
                                    remaining
                                  ),
                                })
                              }
                              placeholder={`Max ${remaining}`}
                              className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              {purchaseOrder.lineItems.every(
                (item) => item.quantityReceived >= item.quantityOrdered
              ) && (
                <p className="text-sm text-green-600 text-center py-4">
                  All items have been fully received.
                </p>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReceiveModal(false);
                  setReceiveQuantities({});
                  setError(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReceive}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Receiving...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


