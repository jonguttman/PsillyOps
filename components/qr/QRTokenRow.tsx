'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Eye, 
  ExternalLink, 
  XCircle, 
  Link as LinkIcon, 
  Unlink,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface QRTokenRowProps {
  token: {
    id: string;
    token: string;
    status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    redirectUrl: string | null;
    scanCount: number;
    lastScannedAt: string | null;
    printedAt: string;
    versionId: string | null;
    versionNumber?: string;
  };
  resolvedDestination: {
    type: 'TOKEN' | 'GROUP' | 'DEFAULT';
    url: string;
    ruleName?: string;
  };
  scanHistory?: Array<{
    id: string;
    timestamp: string;
    resolutionType: string;
    destination: string;
  }>;
  isAdmin: boolean;
  onOverrideRedirect?: (tokenId: string, url: string) => Promise<void>;
  onClearOverride?: (tokenId: string) => Promise<void>;
  onRevokeToken?: (tokenId: string, reason: string) => Promise<void>;
}

export function QRTokenRow({
  token,
  resolvedDestination,
  scanHistory = [],
  isAdmin,
  onOverrideRedirect,
  onClearOverride,
  onRevokeToken
}: QRTokenRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [overrideUrl, setOverrideUrl] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const maskToken = (t: string) => {
    if (t.length <= 12) return t;
    return `${t.slice(0, 7)}…${t.slice(-4)}`;
  };

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    REVOKED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-gray-100 text-gray-600'
  };

  const resolutionColors = {
    TOKEN: 'bg-blue-100 text-blue-800',
    GROUP: 'bg-purple-100 text-purple-800',
    DEFAULT: 'bg-gray-100 text-gray-700'
  };

  const handleOverride = async () => {
    if (!onOverrideRedirect || !overrideUrl.trim()) return;
    setIsLoading(true);
    try {
      await onOverrideRedirect(token.id, overrideUrl.trim());
      setShowOverrideModal(false);
      setOverrideUrl('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearOverride = async () => {
    if (!onClearOverride) return;
    setIsLoading(true);
    try {
      await onClearOverride(token.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!onRevokeToken || !revokeReason.trim()) return;
    setIsLoading(true);
    try {
      await onRevokeToken(token.id, revokeReason.trim());
      setShowRevokeModal(false);
      setRevokeReason('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <tr className="hover:bg-gray-50">
        {/* Expand Toggle + Token */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
            <code className="text-xs font-mono text-gray-600">
              {maskToken(token.token)}
            </code>
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[token.status]}`}>
            {token.status}
          </span>
        </td>

        {/* Resolution */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${resolutionColors[resolvedDestination.type]}`}>
              {resolvedDestination.type}
            </span>
            {resolvedDestination.ruleName && (
              <span className="text-xs text-gray-500 truncate max-w-[100px]" title={resolvedDestination.ruleName}>
                {resolvedDestination.ruleName}
              </span>
            )}
          </div>
        </td>

        {/* Destination */}
        <td className="px-4 py-3">
          <a
            href={resolvedDestination.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 max-w-[200px] truncate"
            title={resolvedDestination.url}
          >
            {resolvedDestination.url}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        </td>

        {/* Scans */}
        <td className="px-4 py-3 text-center">
          <span className="text-sm font-medium text-gray-900">{token.scanCount}</span>
        </td>

        {/* Last Scan */}
        <td className="px-4 py-3">
          {token.lastScannedAt ? (
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(token.lastScannedAt), { addSuffix: true })}
            </span>
          ) : (
            <span className="text-xs text-gray-400">Never</span>
          )}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          {isAdmin && token.status === 'ACTIVE' && (
            <div className="flex items-center gap-1">
              {token.redirectUrl ? (
                <button
                  onClick={handleClearOverride}
                  disabled={isLoading}
                  className="p-1 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded"
                  title="Clear override"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setShowOverrideModal(true)}
                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="Set redirect override"
                >
                  <LinkIcon className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setShowRevokeModal(true)}
                className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                title="Revoke token"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Expanded Details */}
      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-gray-500 font-medium">Printed</div>
                <div className="text-gray-900">
                  {new Date(token.printedAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-gray-500 font-medium">Label Version</div>
                <div className="text-gray-900">
                  {token.versionNumber || token.versionId || '—'}
                </div>
              </div>
              <div>
                <div className="text-gray-500 font-medium">Token Override</div>
                <div className="text-gray-900">
                  {token.redirectUrl || <span className="text-gray-400">None</span>}
                </div>
              </div>
              <div>
                <div className="text-gray-500 font-medium">Full Token</div>
                <code className="text-gray-900 text-[10px] break-all">{token.token}</code>
              </div>
            </div>

            {/* Scan History */}
            {scanHistory.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-500 font-medium mb-2">Recent Scans</div>
                <div className="space-y-1">
                  {scanHistory.slice(0, 5).map((scan) => (
                    <div key={scan.id} className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="text-gray-400 w-32">
                        {formatDistanceToNow(new Date(scan.timestamp), { addSuffix: true })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded ${resolutionColors[scan.resolutionType as keyof typeof resolutionColors] || 'bg-gray-100'}`}>
                        {scan.resolutionType}
                      </span>
                      <span className="truncate">{scan.destination}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <tr>
          <td colSpan={7}>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowOverrideModal(false)}>
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Set Redirect Override</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This override will redirect scans of this specific token, taking precedence over group rules.
                </p>
                <input
                  type="url"
                  value={overrideUrl}
                  onChange={(e) => setOverrideUrl(e.target.value)}
                  placeholder="https://example.com/redirect"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowOverrideModal(false)}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOverride}
                    disabled={isLoading || !overrideUrl.trim()}
                    className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : 'Set Override'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Revoke Modal */}
      {showRevokeModal && (
        <tr>
          <td colSpan={7}>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRevokeModal(false)}>
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-medium text-red-900 mb-4">Revoke Token</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This will permanently invalidate this token. Scans will show a revocation message instead of redirecting.
                </p>
                <input
                  type="text"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Reason for revocation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowRevokeModal(false)}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRevoke}
                    disabled={isLoading || !revokeReason.trim()}
                    className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50"
                  >
                    {isLoading ? 'Revoking...' : 'Revoke Token'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

