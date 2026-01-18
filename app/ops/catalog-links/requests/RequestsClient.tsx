'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Package,
  Beaker,
  ShoppingCart,
  Clock,
  CheckCircle,
  MessageSquare,
  X,
  ChevronDown,
  User,
  Mail,
  Phone,
  Store
} from 'lucide-react';
import { CatalogRequestStatus, CatalogRequestItemType } from '@prisma/client';

interface RequestItem {
  id: string;
  productId: string;
  itemType: CatalogRequestItemType;
  quantity: number;
  sampleReason: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    publicImageUrl: string | null;
  };
}

interface CatalogRequest {
  id: string;
  catalogLinkId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  message: string | null;
  status: CatalogRequestStatus;
  createdAt: string;
  updatedAt: string;
  catalogLink: {
    token: string;
    displayName: string | null;
    retailer: {
      id: string;
      name: string;
      salesRepId: string | null;
    };
  };
  assignedTo: {
    id: string;
    name: string;
  } | null;
  items: RequestItem[];
}

interface RequestsClientProps {
  initialRequests: CatalogRequest[];
  initialTotal: number;
  initialCounts: Record<string, number>;
  userRole: string;
}

const statusConfig = {
  NEW: {
    label: 'New',
    icon: Clock,
    className: 'bg-blue-100 text-blue-800',
    iconClassName: 'text-blue-500'
  },
  CONTACTED: {
    label: 'Contacted',
    icon: MessageSquare,
    className: 'bg-yellow-100 text-yellow-800',
    iconClassName: 'text-yellow-500'
  },
  QUOTED: {
    label: 'Quoted',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800',
    iconClassName: 'text-green-500'
  },
  CLOSED: {
    label: 'Closed',
    icon: X,
    className: 'bg-gray-100 text-gray-800',
    iconClassName: 'text-gray-500'
  }
};

export function RequestsClient({
  initialRequests,
  initialTotal,
  initialCounts,
  userRole
}: RequestsClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [counts, setCounts] = useState(initialCounts);
  const [selectedStatus, setSelectedStatus] = useState<CatalogRequestStatus | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filteredRequests = selectedStatus === 'ALL'
    ? requests
    : requests.filter(r => r.status === selectedStatus);

  const handleStatusChange = async (requestId: string, newStatus: CatalogRequestStatus) => {
    setUpdatingId(requestId);
    try {
      const res = await fetch(`/api/ops/catalog-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        // Update local state
        setRequests(prev => prev.map(r =>
          r.id === requestId ? { ...r, status: newStatus } : r
        ));
        // Refresh counts
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="space-y-6">
      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedStatus('ALL')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            selectedStatus === 'ALL'
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All ({Object.values(counts).reduce((a, b) => a + b, 0)})
        </button>
        {Object.entries(statusConfig).map(([status, config]) => (
          <button
            key={status}
            onClick={() => setSelectedStatus(status as CatalogRequestStatus)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              selectedStatus === status
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {config.label}
            <span className={`px-1.5 py-0.5 text-xs rounded ${
              selectedStatus === status ? 'bg-white/20' : 'bg-gray-200'
            }`}>
              {counts[status] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Requests list */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No requests found</p>
          </div>
        ) : (
          filteredRequests.map(request => {
            const quoteItems = request.items.filter(i => i.itemType === 'QUOTE');
            const sampleItems = request.items.filter(i => i.itemType === 'SAMPLE');
            const isExpanded = expandedId === request.id;
            const config = statusConfig[request.status];
            const StatusIcon = config.icon;

            return (
              <div
                key={request.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                {/* Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : request.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.className.replace('text-', 'bg-').replace('-800', '-100')}`}>
                        <StatusIcon className={`w-5 h-5 ${config.iconClassName}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {request.catalogLink.retailer.name}
                          </h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.className}`}>
                            {config.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                          {request.contactName && (
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5" />
                              {request.contactName}
                            </span>
                          )}
                          <span>{formatDate(request.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Summary badges */}
                      <div className="flex items-center gap-2">
                        {quoteItems.length > 0 && (
                          <span className="flex items-center gap-1 text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                            <ShoppingCart className="w-4 h-4" />
                            {quoteItems.length} quote
                          </span>
                        )}
                        {sampleItems.length > 0 && (
                          <span className="flex items-center gap-1 text-sm text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                            <Beaker className="w-4 h-4" />
                            {sampleItems.length} sample
                          </span>
                        )}
                      </div>

                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {/* Contact info */}
                    <div className="p-4 bg-gray-50 border-b border-gray-200">
                      <div className="flex flex-wrap gap-4">
                        {request.contactEmail && (
                          <a
                            href={`mailto:${request.contactEmail}`}
                            className="flex items-center gap-2 text-sm text-indigo-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail className="w-4 h-4" />
                            {request.contactEmail}
                          </a>
                        )}
                        {request.contactPhone && (
                          <a
                            href={`tel:${request.contactPhone}`}
                            className="flex items-center gap-2 text-sm text-indigo-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="w-4 h-4" />
                            {request.contactPhone}
                          </a>
                        )}
                        <span className="flex items-center gap-2 text-sm text-gray-600">
                          <Store className="w-4 h-4" />
                          {request.catalogLink.displayName || request.catalogLink.retailer.name}
                        </span>
                      </div>
                      {request.message && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                          <p className="text-sm text-gray-700">{request.message}</p>
                        </div>
                      )}
                    </div>

                    {/* Items */}
                    <div className="p-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Requested Items</h4>
                      <div className="space-y-3">
                        {request.items.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                          >
                            {/* Product image */}
                            <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                              {item.product.publicImageUrl ? (
                                <img
                                  src={item.product.publicImageUrl}
                                  alt={item.product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>

                            {/* Product details */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{item.product.name}</p>
                              <p className="text-xs text-gray-500 font-mono">{item.product.sku}</p>
                              {item.sampleReason && (
                                <p className="text-sm text-indigo-600 mt-1">
                                  Reason: {item.sampleReason}
                                </p>
                              )}
                            </div>

                            {/* Type & quantity */}
                            <div className="text-right">
                              <span className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg ${
                                item.itemType === 'QUOTE'
                                  ? 'bg-gray-100 text-gray-700'
                                  : 'bg-indigo-50 text-indigo-700'
                              }`}>
                                {item.itemType === 'QUOTE' ? (
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                ) : (
                                  <Beaker className="w-3.5 h-3.5" />
                                )}
                                {item.itemType}
                              </span>
                              <p className="text-sm text-gray-600 mt-1">Qty: {item.quantity}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Update status:</span>
                        {Object.entries(statusConfig).map(([status, config]) => (
                          <button
                            key={status}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (status !== request.status) {
                                handleStatusChange(request.id, status as CatalogRequestStatus);
                              }
                            }}
                            disabled={updatingId === request.id || status === request.status}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              status === request.status
                                ? config.className
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                            } disabled:opacity-50`}
                          >
                            {config.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
