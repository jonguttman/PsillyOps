'use client';

/**
 * QRTokenAssociationSection Component
 *
 * Card component for batch detail pages that allows associating QR tokens
 * with batches. Supports scanning QR codes or selecting from eligible tokens.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  ScanLine,
  List,
  Link2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import TokenScannerModal from './TokenScannerModal';

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

interface EligibleToken {
  id: string;
  token: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  entityType: 'PRODUCT' | 'BATCH';
  entityId: string;
  entityName: string;
  printedAt: string;
  scanCount: number;
  isEligible: boolean;
  eligibilityReason?: string;
  requiresAdminOverride?: boolean;
}

interface TokenEligibility {
  eligible: boolean;
  reason?: string;
  requiresAdminOverride?: boolean;
}

interface QRTokenAssociationSectionProps {
  batchId: string;
  batchCode: string;
  productId: string;
  productName: string;
  isAdmin: boolean;
  canManage: boolean;
}

export default function QRTokenAssociationSection({
  batchId,
  batchCode,
  productId,
  productName,
  isAdmin,
  canManage
}: QRTokenAssociationSectionProps) {
  const [mode, setMode] = useState<'scan' | 'select'>('scan');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Selected token state
  const [selectedToken, setSelectedToken] = useState<ResolvedToken | null>(null);
  const [selectedEligibility, setSelectedEligibility] = useState<TokenEligibility | null>(null);

  // Eligible tokens list
  const [eligibleTokens, setEligibleTokens] = useState<EligibleToken[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [tokensTotal, setTokensTotal] = useState(0);
  const [includeOtherProducts, setIncludeOtherProducts] = useState(false);

  // Association state
  const [isAssociating, setIsAssociating] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  const [associationSuccess, setAssociationSuccess] = useState(false);
  const [reason, setReason] = useState('');
  const [useAdminOverride, setUseAdminOverride] = useState(false);

  // Confirmation dialog
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Load eligible tokens when in select mode
  useEffect(() => {
    if (mode === 'select' && isExpanded) {
      loadEligibleTokens();
    }
  }, [mode, isExpanded, includeOtherProducts]);

  const loadEligibleTokens = useCallback(async () => {
    setIsLoadingTokens(true);
    try {
      const params = new URLSearchParams({
        batchId,
        status: 'ACTIVE',
        includeOtherProducts: includeOtherProducts.toString(),
        limit: '20'
      });

      const response = await fetch(`/api/qr-tokens/eligible?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load tokens');
      }

      setEligibleTokens(data.tokens);
      setTokensTotal(data.total);
    } catch (err) {
      console.error('Failed to load eligible tokens:', err);
    } finally {
      setIsLoadingTokens(false);
    }
  }, [batchId, includeOtherProducts]);

  const handleTokenScanned = useCallback((token: ResolvedToken, eligibility?: TokenEligibility) => {
    setSelectedToken(token);
    setSelectedEligibility(eligibility || null);
    setShowConfirmation(true);
  }, []);

  const handleTokenSelected = useCallback((token: EligibleToken) => {
    setSelectedToken({
      id: token.id,
      token: token.token,
      status: token.status,
      entityType: token.entityType,
      entityId: token.entityId,
      entityName: token.entityName,
      printedAt: token.printedAt,
      scanCount: token.scanCount,
      lastScannedAt: null
    });
    setSelectedEligibility({
      eligible: token.isEligible,
      reason: token.eligibilityReason,
      requiresAdminOverride: token.requiresAdminOverride
    });
    setShowConfirmation(true);
  }, []);

  const handleAssociate = useCallback(async () => {
    if (!selectedToken) return;

    setIsAssociating(true);
    setAssociationError(null);

    try {
      const response = await fetch(`/api/qr-tokens/${selectedToken.id}/associate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBatchId: batchId,
          reason: reason.trim() || undefined,
          adminOverride: useAdminOverride
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to associate token');
      }

      setAssociationSuccess(true);
      setShowConfirmation(false);
      setSelectedToken(null);
      setSelectedEligibility(null);
      setReason('');
      setUseAdminOverride(false);

      // Refresh the page to show updated token list
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setAssociationError(err instanceof Error ? err.message : 'Failed to associate token');
    } finally {
      setIsAssociating(false);
    }
  }, [selectedToken, batchId, reason, useAdminOverride]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
    setSelectedToken(null);
    setSelectedEligibility(null);
    setReason('');
    setUseAdminOverride(false);
    setAssociationError(null);
  }, []);

  if (!canManage) {
    return null;
  }

  return (
    <>
      <div className="bg-white shadow rounded-lg">
        {/* Header - Always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-6 py-4 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Link2 className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-medium text-gray-900">Associate QR Token</h2>
              <p className="text-sm text-gray-500">Link a printed QR code to this batch</p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="px-6 pb-6 border-t">
            {/* Success message */}
            {associationSuccess && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                  <span className="text-green-800 font-medium">
                    Token successfully associated with this batch!
                  </span>
                </div>
                <p className="text-sm text-green-700 mt-1">Refreshing page...</p>
              </div>
            )}

            {!associationSuccess && (
              <>
                {/* Mode toggle */}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setMode('scan')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      mode === 'scan'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    <ScanLine className="w-4 h-4" />
                    Scan Token
                  </button>
                  <button
                    onClick={() => setMode('select')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      mode === 'select'
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    <List className="w-4 h-4" />
                    Select from List
                  </button>
                </div>

                {/* Scan mode */}
                {mode === 'scan' && (
                  <div className="mt-4">
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <ScanLine className="w-5 h-5" />
                      Open Camera Scanner
                    </button>
                    <p className="mt-2 text-xs text-gray-500 text-center">
                      Scan the QR code on the physical label
                    </p>
                  </div>
                )}

                {/* Select mode */}
                {mode === 'select' && (
                  <div className="mt-4">
                    {/* Admin toggle for other products */}
                    {isAdmin && (
                      <div className="mb-4 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="includeOther"
                          checked={includeOtherProducts}
                          onChange={(e) => setIncludeOtherProducts(e.target.checked)}
                          className="h-4 w-4 text-blue-600 rounded border-gray-300"
                        />
                        <label htmlFor="includeOther" className="text-sm text-gray-700">
                          Include tokens from other products (admin override)
                        </label>
                      </div>
                    )}

                    {/* Token list */}
                    {isLoadingTokens ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                      </div>
                    ) : eligibleTokens.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>No eligible tokens found for product &quot;{productName}&quot;</p>
                        <p className="text-sm mt-1">
                          Tokens are created when printing labels.
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-500 mb-2">
                          Showing {eligibleTokens.length} of {tokensTotal} eligible tokens
                        </p>
                        <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                          {eligibleTokens.map((token) => (
                            <button
                              key={token.id}
                              onClick={() => handleTokenSelected(token)}
                              disabled={!token.isEligible && !token.requiresAdminOverride}
                              className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                                !token.isEligible && !token.requiresAdminOverride
                                  ? 'opacity-50 cursor-not-allowed'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-mono text-sm text-gray-900">
                                    {token.token}
                                  </span>
                                  <span className="ml-2 text-xs text-gray-500">
                                    {token.entityName}
                                  </span>
                                </div>
                                {token.requiresAdminOverride && (
                                  <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded">
                                    Admin Only
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                Printed {new Date(token.printedAt).toLocaleDateString()} •
                                {token.scanCount} scans
                              </div>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={loadEligibleTokens}
                          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                        >
                          Refresh list
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Scanner Modal */}
      <TokenScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onTokenResolved={handleTokenScanned}
        targetBatchId={batchId}
        batchCode={batchCode}
      />

      {/* Confirmation Modal */}
      {showConfirmation && selectedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Confirm Token Association
              </h3>

              <p className="text-gray-600 mb-4">
                Associate token <span className="font-mono">{selectedToken.token}</span> with
                batch <strong>{batchCode}</strong>?
              </p>

              <div className="p-3 bg-gray-50 rounded-lg mb-4">
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-gray-500">Current Type</dt>
                    <dd className="text-gray-900">{selectedToken.entityType}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Current Entity</dt>
                    <dd className="text-gray-900">{selectedToken.entityName}</dd>
                  </div>
                </dl>
              </div>

              {/* Warning for admin override */}
              {selectedEligibility?.requiresAdminOverride && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        Admin Override Required
                      </p>
                      <p className="text-sm text-yellow-700">
                        {selectedEligibility.reason}
                      </p>
                      {isAdmin && (
                        <label className="flex items-center gap-2 mt-2">
                          <input
                            type="checkbox"
                            checked={useAdminOverride}
                            onChange={(e) => setUseAdminOverride(e.target.checked)}
                            className="h-4 w-4 text-yellow-600 rounded border-gray-300"
                          />
                          <span className="text-sm text-yellow-800">
                            I authorize this override
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Optional reason */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Labeling batch XYZ"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Error */}
              {associationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <p className="text-sm text-red-700">{associationError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleCancelConfirmation}
                  disabled={isAssociating}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssociate}
                  disabled={
                    isAssociating ||
                    (selectedEligibility?.requiresAdminOverride && !useAdminOverride)
                  }
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isAssociating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Associating...
                    </>
                  ) : (
                    'Associate Token'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
