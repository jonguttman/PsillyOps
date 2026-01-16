'use client';

/**
 * TokenScannerModal Component
 *
 * Wraps BarcodeScanner for QR token association workflow.
 * Scans a QR code and resolves it to a token record with eligibility check.
 */

import React, { useState, useCallback } from 'react';
import { X, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import BarcodeScanner from '@/components/mobile/BarcodeScanner';

interface ResolvedToken {
  id: string;
  token: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY' | 'CUSTOM';
  entityId: string;
  entityName: string;
  printedAt: string;
  scanCount: number;
  lastScannedAt: string | null;
}

interface TokenEligibility {
  eligible: boolean;
  reason?: string;
  requiresAdminOverride?: boolean;
}

interface TokenScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenResolved: (token: ResolvedToken, eligibility?: TokenEligibility) => void;
  targetBatchId?: string;
  batchCode?: string;
}

export default function TokenScannerModal({
  isOpen,
  onClose,
  onTokenResolved,
  targetBatchId,
  batchCode
}: TokenScannerModalProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedToken, setResolvedToken] = useState<ResolvedToken | null>(null);
  const [eligibility, setEligibility] = useState<TokenEligibility | null>(null);

  const handleScan = useCallback(async (value: string) => {
    // Check if it's a QR token (starts with qr_ or is a URL containing a token)
    let tokenValue = value;

    // Extract token from URL if scanned a full URL
    if (value.includes('/qr/qr_')) {
      const match = value.match(/qr_[A-Za-z0-9]+/);
      if (match) {
        tokenValue = match[0];
      }
    } else if (!value.startsWith('qr_')) {
      setError('Invalid QR code format. Expected a PsillyOps QR token.');
      return;
    }

    setIsResolving(true);
    setError(null);

    try {
      const response = await fetch('/api/qr-tokens/resolve-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenValue,
          targetBatchId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resolve token');
      }

      if (!data.found) {
        setError('Token not found. The QR code may be invalid or deleted.');
        return;
      }

      setResolvedToken(data.token);
      setEligibility(data.eligibility || null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve token');
    } finally {
      setIsResolving(false);
    }
  }, [targetBatchId]);

  const handleConfirm = useCallback(() => {
    if (resolvedToken) {
      onTokenResolved(resolvedToken, eligibility || undefined);
      onClose();
    }
  }, [resolvedToken, eligibility, onTokenResolved, onClose]);

  const handleReset = useCallback(() => {
    setResolvedToken(null);
    setEligibility(null);
    setError(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Scan QR Token</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!resolvedToken ? (
            <>
              {/* Scanner */}
              <div className="mb-4">
                <BarcodeScanner
                  onScan={handleScan}
                  onError={(err) => setError(err)}
                  autoStart={true}
                />
              </div>

              {/* Loading state */}
              {isResolving && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin mr-2" />
                  <span className="text-gray-600">Resolving token...</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}

              {targetBatchId && (
                <p className="mt-4 text-sm text-gray-500 text-center">
                  Scanning for batch: <strong>{batchCode}</strong>
                </p>
              )}
            </>
          ) : (
            <>
              {/* Token Details */}
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Token Found</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500">Token</dt>
                      <dd className="font-mono text-gray-900">{resolvedToken.token}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Status</dt>
                      <dd>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          resolvedToken.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                          resolvedToken.status === 'REVOKED' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {resolvedToken.status}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Type</dt>
                      <dd className="text-gray-900">{resolvedToken.entityType}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Entity</dt>
                      <dd className="text-gray-900">{resolvedToken.entityName}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Printed</dt>
                      <dd className="text-gray-900">
                        {new Date(resolvedToken.printedAt).toLocaleDateString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Scans</dt>
                      <dd className="text-gray-900">{resolvedToken.scanCount}</dd>
                    </div>
                  </dl>
                </div>

                {/* Eligibility */}
                {eligibility && (
                  <div className={`p-4 rounded-lg ${
                    eligibility.eligible
                      ? 'bg-green-50 border border-green-200'
                      : eligibility.requiresAdminOverride
                        ? 'bg-yellow-50 border border-yellow-200'
                        : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-start">
                      {eligibility.eligible ? (
                        <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className={`w-5 h-5 mt-0.5 mr-2 flex-shrink-0 ${
                          eligibility.requiresAdminOverride ? 'text-yellow-500' : 'text-red-500'
                        }`} />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${
                          eligibility.eligible
                            ? 'text-green-800'
                            : eligibility.requiresAdminOverride
                              ? 'text-yellow-800'
                              : 'text-red-800'
                        }`}>
                          {eligibility.eligible
                            ? 'Eligible for association'
                            : eligibility.requiresAdminOverride
                              ? 'Requires admin override'
                              : 'Not eligible'}
                        </p>
                        {eligibility.reason && (
                          <p className={`text-sm mt-1 ${
                            eligibility.eligible
                              ? 'text-green-700'
                              : eligibility.requiresAdminOverride
                                ? 'text-yellow-700'
                                : 'text-red-700'
                          }`}>
                            {eligibility.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Scan Another
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!eligibility?.eligible && !eligibility?.requiresAdminOverride}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Select Token
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
