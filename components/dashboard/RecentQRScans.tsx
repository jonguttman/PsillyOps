'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { QrCode, RefreshCw, ExternalLink } from 'lucide-react';

interface QRScan {
  id: string;
  scannedAt: string;
  tokenId: string | null;
  tokenShortHash: string | null;
  entityType: string;
  entityId: string;
  entityName: string;
  resolutionType: 'TOKEN' | 'GROUP' | 'DEFAULT';
  destination: string | null;
  status: string;
}

export default function RecentQRScans() {
  const [scans, setScans] = useState<QRScan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchScans = useCallback(async () => {
    try {
      const response = await fetch('/api/qr-tokens/recent-scans?limit=20');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setScans(data.scans || []);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to load recent scans');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScans();

    // Poll every 30 seconds
    const interval = setInterval(fetchScans, 30000);

    // Refresh on window focus
    const handleFocus = () => fetchScans();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchScans]);

  const resolutionColors = {
    TOKEN: 'bg-blue-100 text-blue-800',
    GROUP: 'bg-purple-100 text-purple-800',
    DEFAULT: 'bg-gray-100 text-gray-700'
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    REVOKED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-gray-100 text-gray-600',
    UNKNOWN: 'bg-yellow-100 text-yellow-800'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Recent QR Scans</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </span>
          <button
            onClick={() => { setIsLoading(true); fetchScans(); }}
            disabled={isLoading}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="px-5 py-8 text-center text-sm text-red-600">{error}</div>
      ) : isLoading && scans.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading scans...
        </div>
      ) : scans.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-500">
          <QrCode className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No recent QR scans
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Token</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scans.map((scan) => (
                <tr 
                  key={scan.id} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => scan.tokenId && (window.location.href = `/qr/${scan.tokenId}`)}
                >
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(scan.scannedAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="text-xs font-mono text-gray-600">
                      {scan.tokenShortHash || '—'}
                    </code>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                        {scan.entityType}
                      </span>
                      <span className="text-xs text-gray-900 truncate max-w-[150px]" title={scan.entityName}>
                        {scan.entityName || scan.entityId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${resolutionColors[scan.resolutionType] || resolutionColors.DEFAULT}`}>
                      {scan.resolutionType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[scan.status] || statusColors.UNKNOWN}`}>
                      {scan.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        Click a scan to view QR details • Auto-refreshes every 30s
      </div>
    </div>
  );
}

