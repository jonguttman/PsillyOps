'use client';

import { useState, useEffect } from 'react';
import { QRTokenRow } from './QRTokenRow';
import { QrCode, RefreshCw, AlertTriangle } from 'lucide-react';

interface TokenData {
  id: string;
  token: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  redirectUrl: string | null;
  scanCount: number;
  lastScannedAt: string | null;
  printedAt: string;
  versionId: string | null;
  versionNumber?: string;
}

interface ResolvedDestination {
  type: 'TOKEN' | 'GROUP' | 'DEFAULT';
  url: string;
  ruleName?: string;
}

interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  resolutionType: string;
  destination: string;
}

interface QRTokenInspectorProps {
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  entityId: string;
  isAdmin: boolean;
  canView: boolean; // ADMIN or MANAGER
}

export function QRTokenInspector({
  entityType,
  entityId,
  isAdmin,
  canView
}: QRTokenInspectorProps) {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [resolvedDestinations, setResolvedDestinations] = useState<Record<string, ResolvedDestination>>({});
  const [scanHistories, setScanHistories] = useState<Record<string, ScanHistoryEntry[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'ACTIVE' | 'REVOKED' | 'EXPIRED'>('ACTIVE');
  const [stats, setStats] = useState<{
    total: number;
    active: number;
    revoked: number;
    expired: number;
    totalScans: number;
  } | null>(null);

  const fetchTokens = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const statusParam = filter === 'all' ? '' : `&status=${filter}`;
      const response = await fetch(
        `/api/qr-tokens/for-entity?entityType=${entityType}&entityId=${entityId}${statusParam}&limit=50`
      );
      if (!response.ok) throw new Error('Failed to fetch tokens');
      const data = await response.json();
      setTokens(data.tokens || []);
      setStats(data.stats || null);
      setResolvedDestinations(data.resolvedDestinations || {});
      setScanHistories(data.scanHistories || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      fetchTokens();
    }
  }, [entityType, entityId, filter, canView]);

  const handleOverrideRedirect = async (tokenId: string, url: string) => {
    const response = await fetch(`/api/qr-tokens/${tokenId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirectUrl: url })
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to set override');
    }
    await fetchTokens();
  };

  const handleClearOverride = async (tokenId: string) => {
    const response = await fetch(`/api/qr-tokens/${tokenId}/override`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to clear override');
    }
    await fetchTokens();
  };

  const handleRevokeToken = async (tokenId: string, reason: string) => {
    const response = await fetch(`/api/qr-tokens/${tokenId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to revoke token');
    }
    await fetchTokens();
  };

  if (!canView) {
    return null;
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QrCode className="w-5 h-5 text-gray-500" />
            <h3 className="text-lg font-medium text-gray-900">QR Token Inspector</h3>
          </div>
          <button
            onClick={fetchTokens}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats Strip */}
        {stats && (
          <div className="mt-4 grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-green-600">{stats.active}</div>
              <div className="text-xs text-gray-500">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-red-600">{stats.revoked}</div>
              <div className="text-xs text-gray-500">Revoked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-gray-500">{stats.expired}</div>
              <div className="text-xs text-gray-500">Expired</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-blue-600">{stats.totalScans}</div>
              <div className="text-xs text-gray-500">Total Scans</div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-gray-500">Show:</span>
          <div className="flex gap-1">
            {(['ACTIVE', 'REVOKED', 'EXPIRED', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-md ${
                  filter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="px-6 py-12 text-center text-gray-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading tokens...
        </div>
      ) : tokens.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500">
          <QrCode className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No tokens found for this entity.</p>
          <p className="text-xs mt-1">Tokens are created when labels are printed.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Token
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Resolution
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Destination
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Scans
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Scan
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tokens.map((token) => (
                <QRTokenRow
                  key={token.id}
                  token={token}
                  resolvedDestination={resolvedDestinations[token.id] || {
                    type: 'DEFAULT',
                    url: `/${entityType.toLowerCase()}/${entityId}`
                  }}
                  scanHistory={scanHistories[token.id] || []}
                  isAdmin={isAdmin}
                  onOverrideRedirect={isAdmin ? handleOverrideRedirect : undefined}
                  onClearOverride={isAdmin ? handleClearOverride : undefined}
                  onRevokeToken={isAdmin ? handleRevokeToken : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        QR tokens represent printed labels. Each token resolves via: Token Override → Group Rule → Default.
      </div>
    </div>
  );
}

// Server wrapper to fetch initial data
export async function QRTokenInspectorServer({
  entityType,
  entityId,
  isAdmin,
  canView
}: QRTokenInspectorProps) {
  return (
    <QRTokenInspector
      entityType={entityType}
      entityId={entityId}
      isAdmin={isAdmin}
      canView={canView}
    />
  );
}

