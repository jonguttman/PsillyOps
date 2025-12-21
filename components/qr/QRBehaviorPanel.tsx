// QR Behavior Panel Component
// Shows active redirect rule and token count for an entity
// Can be added to product, batch, and inventory detail pages

'use client';

import { useState } from 'react';
import Link from 'next/link';

interface QRBehaviorPanelProps {
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  entityId: string;
  entityName: string;
  activeRule: {
    id: string;
    redirectUrl: string;
    reason: string | null;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  tokenCount: number;
  isAdmin: boolean;
}

export function QRBehaviorPanel({
  entityType,
  entityId,
  entityName,
  activeRule,
  tokenCount,
  isAdmin
}: QRBehaviorPanelProps) {
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    if (!activeRule || !isAdmin) return;
    
    setIsDeactivating(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/qr-redirects/${activeRule.id}/deactivate`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to deactivate rule');
      }
      
      // Reload page to reflect changes
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-medium text-gray-900">QR Behavior</h2>
        {isAdmin && (
          <div className="flex gap-2">
            {activeRule ? (
              <button
                onClick={handleDeactivate}
                disabled={isDeactivating}
                className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
              >
                {isDeactivating ? 'Deactivating...' : 'Deactivate Redirect'}
              </button>
            ) : (
              <Link
                href={`/ops/qr/redirects/new?entityType=${entityType}&entityId=${entityId}&entityName=${encodeURIComponent(entityName)}`}
                className="inline-flex items-center px-3 py-1.5 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
              >
                Create Redirect
              </Link>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Active Redirect Rule */}
        {activeRule ? (
          <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                    Active Redirect
                  </span>
                </div>
                <div className="text-sm text-gray-900">
                  <strong>Destination:</strong>{' '}
                  <a 
                    href={activeRule.redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    {activeRule.redirectUrl}
                  </a>
                </div>
                {activeRule.reason && (
                  <div className="text-sm text-gray-600 mt-1">
                    <strong>Reason:</strong> {activeRule.reason}
                  </div>
                )}
                {(activeRule.startsAt || activeRule.endsAt) && (
                  <div className="text-sm text-gray-600 mt-1">
                    <strong>Window:</strong>{' '}
                    {activeRule.startsAt && (
                      <span>From {new Date(activeRule.startsAt).toLocaleDateString()}</span>
                    )}
                    {activeRule.startsAt && activeRule.endsAt && ' '}
                    {activeRule.endsAt && (
                      <span>Until {new Date(activeRule.endsAt).toLocaleDateString()}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            No active redirect rule. QR scans will use default routing.
          </div>
        )}

        {/* Token Count */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-500">Active QR Tokens</div>
              <div className="text-2xl font-semibold text-gray-900">{tokenCount}</div>
            </div>
            <div className="text-xs text-gray-500">
              {activeRule 
                ? `${tokenCount} token${tokenCount !== 1 ? 's' : ''} affected by this redirect`
                : `${tokenCount} token${tokenCount !== 1 ? 's' : ''} using default routing`
              }
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-4 text-xs text-gray-400">
        QR redirects apply to all scans without reprinting labels.
        {isAdmin && (
          <>
            {' '}
            <Link href="/ops/qr/redirects" className="text-blue-500 hover:text-blue-700">
              Manage all redirect rules →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}


