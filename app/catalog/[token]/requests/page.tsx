'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Package, ClipboardList, Clock, CheckCircle, MessageSquare, Phone, Loader2 } from 'lucide-react';

interface RequestItem {
  id: string;
  itemType: 'QUOTE' | 'SAMPLE';
  quantity: number;
  sampleReason: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
  };
}

interface CatalogRequest {
  id: string;
  status: 'NEW' | 'CONTACTED' | 'QUOTED' | 'CLOSED';
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  message: string | null;
  createdAt: string;
  items: RequestItem[];
}

const REQUESTS_STORAGE_PREFIX = 'catalog-requests-';

const statusConfig = {
  NEW: {
    label: 'Submitted',
    description: 'Waiting for sales rep',
    icon: Clock,
    className: 'bg-blue-100 text-blue-800',
    iconClassName: 'text-blue-500'
  },
  CONTACTED: {
    label: 'In Progress',
    description: 'Your rep has reached out',
    icon: MessageSquare,
    className: 'bg-yellow-100 text-yellow-800',
    iconClassName: 'text-yellow-500'
  },
  QUOTED: {
    label: 'Quote Sent',
    description: 'Check your email for quote',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800',
    iconClassName: 'text-green-500'
  },
  CLOSED: {
    label: 'Closed',
    description: 'Request completed',
    icon: CheckCircle,
    className: 'bg-gray-100 text-gray-800',
    iconClassName: 'text-gray-500'
  }
};

export default function MyRequestsPage() {
  const params = useParams();
  const token = params.token as string;

  const [requests, setRequests] = useState<CatalogRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRequests() {
      try {
        const storageKey = `${REQUESTS_STORAGE_PREFIX}${token}`;
        const stored = localStorage.getItem(storageKey);

        if (!stored) {
          setRequests([]);
          setLoading(false);
          return;
        }

        const requestIds: string[] = JSON.parse(stored);

        if (requestIds.length === 0) {
          setRequests([]);
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/catalog/${token}/my-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestIds })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch requests');
        }

        const data = await response.json();
        setRequests(data.requests || []);
      } catch (err) {
        console.error('Error fetching requests:', err);
        setError('Failed to load your requests');
      } finally {
        setLoading(false);
      }
    }

    fetchRequests();
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href={`/catalog/${token}`}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Catalog
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">My Requests</h1>
            <p className="text-sm text-gray-500">Track your quote and sample requests</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
            {error}
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No requests yet</h3>
            <p className="text-gray-500 mb-4">
              Browse the catalog and add items to your quote or sample request.
            </p>
            <Link
              href={`/catalog/${token}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(request => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} PsillyOps. All prices are wholesale.
        </div>
      </footer>
    </div>
  );
}

function RequestCard({ request }: { request: CatalogRequest }) {
  const status = statusConfig[request.status];
  const StatusIcon = status.icon;

  const quoteItems = request.items.filter(item => item.itemType === 'QUOTE');
  const sampleItems = request.items.filter(item => item.itemType === 'SAMPLE');

  const formattedDate = new Date(request.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-5 h-5 ${status.iconClassName}`} />
          <div>
            <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${status.className}`}>
              {status.label}
            </span>
            <p className="text-xs text-gray-500 mt-1">{status.description}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">{formattedDate}</p>
        </div>
      </div>

      {/* Items */}
      <div className="p-4">
        {quoteItems.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Quote Requests ({quoteItems.length})
            </h4>
            <div className="space-y-2">
              {quoteItems.map(item => (
                <ItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {sampleItems.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Sample Requests ({sampleItems.length})
            </h4>
            <div className="space-y-2">
              {sampleItems.map(item => (
                <ItemRow key={item.id} item={item} showReason />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contact Info */}
      {(request.contactName || request.contactPhone) && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {request.contactName && (
              <span>{request.contactName}</span>
            )}
            {request.contactPhone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {request.contactPhone}
              </span>
            )}
          </div>
          {request.message && (
            <p className="text-sm text-gray-500 mt-2 italic">"{request.message}"</p>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, showReason }: { item: RequestItem; showReason?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
      <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
        {item.product.imageUrl ? (
          <img
            src={item.product.imageUrl}
            alt={item.product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
        <p className="text-xs text-gray-500">
          {item.product.sku} · Qty: {item.quantity}
        </p>
        {showReason && item.sampleReason && (
          <p className="text-xs text-indigo-600 truncate">Reason: {item.sampleReason}</p>
        )}
      </div>
    </div>
  );
}
