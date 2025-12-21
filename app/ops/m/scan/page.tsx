'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, Clipboard, ArrowRight, Package, Box, AlertCircle, Link2 } from 'lucide-react';
import { GlassCard, CeramicCard, PillButton, BarcodeScanner } from '@/components/mobile';
import type { ScanResult, Action } from '@/lib/services/scanResolverService';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

type ScanMode = 'camera' | 'paste';
type ViewState = 'scan' | 'resolving' | 'result' | 'link-upc';

function extractToken(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith('qr_')) return raw;

  // Accept /qr/<token> paths or full URLs containing /qr/<token>
  const idx = raw.indexOf('/qr/');
  if (idx >= 0) {
    const after = raw.slice(idx + 4);
    const token = after.split(/[?#/]/)[0];
    if (token.startsWith('qr_')) return token;
  }

  return null;
}

export default function MobileScanPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ScanMode>('camera');
  const [viewState, setViewState] = useState<ViewState>('scan');
  const [pasteValue, setPasteValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [lastScannedValue, setLastScannedValue] = useState<string | null>(null);

  const token = useMemo(() => extractToken(pasteValue), [pasteValue]);

  // Handle barcode scan from camera
  const handleBarcodeScan = useCallback(async (value: string, format: string) => {
    setLastScannedValue(value);
    setError(null);
    setIsResolving(true);
    setViewState('resolving');
    trackEvent('barcode_scanned', { format, valueLength: value.length });

    try {
      // Check if it's a QR token - go directly to resolver
      const qrToken = extractToken(value);
      if (qrToken) {
        trackEvent('qr_token_detected', { tokenId: qrToken });
        router.push(`/qr/${qrToken}`);
        return;
      }

      // For UPC/EAN, use the lookup API
      const res = await fetch(`/api/lookup/upc/${encodeURIComponent(value)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to resolve barcode');
      }

      setScanResult(data);
      setViewState('result');
      trackEvent('barcode_resolved', { 
        type: data.type, 
        hasEntity: !!data.entity,
        linkAvailable: data.linkUpcAvailable 
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve barcode';
      setError(message);
      setViewState('scan');
      trackEvent('barcode_resolve_error', { error: message });
    } finally {
      setIsResolving(false);
    }
  }, [router]);

  // Handle paste/manual entry
  const handlePasteGo = useCallback(() => {
    setError(null);
    const t = extractToken(pasteValue);
    if (!t) {
      setError('Paste a /qr/{token} URL or a qr_ token.');
      trackEvent('paste_failure', { error: 'invalid_token' });
      return;
    }

    trackEvent('paste_success', { tokenId: t });
    router.push(`/qr/${t}`);
  }, [router, pasteValue]);

  // Handle clipboard paste
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasteValue(text);
      setError(null);
      trackEvent('clipboard_paste', { hasContent: !!text });
      
      // Auto-resolve if it looks like a barcode
      if (text && !extractToken(text)) {
        handleBarcodeScan(text, 'CLIPBOARD');
      }
    } catch {
      setError('Unable to read clipboard. Please paste manually.');
      trackEvent('clipboard_error');
    }
  }, [handleBarcodeScan]);

  // Handle action selection from result
  const handleAction = useCallback((action: Action) => {
    if (!scanResult?.entity) return;
    
    trackEvent('action_selected', { 
      action: action.type, 
      entityType: scanResult.entity.type,
      entityId: scanResult.entity.id 
    });

    switch (action.type) {
      case 'VIEW_DETAILS':
        if (scanResult.entity.type === 'PRODUCT') {
          router.push(`/ops/products/${scanResult.entity.id}`);
        } else if (scanResult.entity.type === 'MATERIAL') {
          router.push(`/ops/materials/${scanResult.entity.id}`);
        } else if (scanResult.entity.type === 'BATCH') {
          router.push(`/ops/batches/${scanResult.entity.id}`);
        } else if (scanResult.entity.type === 'INVENTORY') {
          router.push(`/ops/inventory/${scanResult.entity.id}`);
        } else if (scanResult.entity.type === 'PRODUCTION_RUN') {
          router.push(`/ops/production-runs/${scanResult.entity.id}`);
        }
        break;
      case 'RECEIVE_INVENTORY':
        // TODO: Open receiving flow
        router.push(`/ops/materials/${scanResult.entity.id}`);
        break;
      case 'ADJUST_INVENTORY':
        // TODO: Open adjust flow
        router.push(`/ops/inventory/${scanResult.entity.id}`);
        break;
      case 'ADVANCE_STEP':
      case 'START_RUN':
      case 'COMPLETE_RUN':
        router.push(`/ops/production-runs/${scanResult.entity.id}`);
        break;
      case 'PRINT_LABELS':
        router.push(`/ops/products/${scanResult.entity.id}`);
        break;
      default:
        break;
    }
  }, [scanResult, router]);

  // Handle link UPC flow
  const handleLinkUpc = useCallback(() => {
    setViewState('link-upc');
    trackEvent('link_upc_started', { upc: lastScannedValue });
  }, [lastScannedValue]);

  // Reset to scan view
  const resetScan = useCallback(() => {
    setViewState('scan');
    setScanResult(null);
    setError(null);
    setLastScannedValue(null);
  }, []);

  // Render based on view state
  if (viewState === 'resolving') {
    return (
      <div className="space-y-4">
        <GlassCard className="!p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 mb-4 rounded-full bg-blue-100 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-gray-900">Resolving barcode...</p>
            <p className="text-xs text-gray-500 mt-1 font-mono">{lastScannedValue?.slice(0, 20)}</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (viewState === 'result' && scanResult) {
    return (
      <div className="space-y-4">
        {/* Entity info */}
        {scanResult.entity ? (
          <CeramicCard>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                {scanResult.entity.type === 'PRODUCT' && <Package className="w-5 h-5 text-blue-600" />}
                {scanResult.entity.type === 'MATERIAL' && <Box className="w-5 h-5 text-blue-600" />}
                {scanResult.entity.type === 'BATCH' && <Box className="w-5 h-5 text-green-600" />}
                {scanResult.entity.type === 'PRODUCTION_RUN' && <Box className="w-5 h-5 text-purple-600" />}
                {scanResult.entity.type === 'INVENTORY' && <Box className="w-5 h-5 text-gray-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{scanResult.entity.name}</p>
                <p className="text-xs text-gray-500">{scanResult.entity.sku}</p>
                {scanResult.entity.state.quantity !== undefined && (
                  <p className="text-xs text-gray-500 mt-1">
                    Qty: {scanResult.entity.state.quantity}
                    {scanResult.entity.state.location && ` · ${scanResult.entity.state.location}`}
                  </p>
                )}
              </div>
            </div>
          </CeramicCard>
        ) : scanResult.linkUpcAvailable ? (
          <CeramicCard variant="warning">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">UPC Not Linked</p>
                <p className="text-xs text-amber-700 mt-1">
                  This barcode isn&apos;t linked to any product or material yet.
                </p>
              </div>
            </div>
          </CeramicCard>
        ) : null}

        {/* Open PO lines (for materials) */}
        {scanResult.openPOLines && scanResult.openPOLines.length > 0 && (
          <GlassCard>
            <p className="text-xs font-medium text-gray-500 mb-2">Open Purchase Orders</p>
            <div className="space-y-2">
              {scanResult.openPOLines.map((po) => (
                <div key={po.lineItemId} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{po.poNumber}</p>
                    <p className="text-xs text-gray-500">{po.vendorName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{po.quantityRemaining} remaining</p>
                    <p className="text-xs text-gray-500">of {po.quantityOrdered}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {scanResult.availableActions.filter(a => a.primary).map((action) => (
            <PillButton
              key={action.type}
              variant="ceramic"
              onClick={() => handleAction(action)}
              disabled={action.disabled}
              className="w-full"
            >
              {action.label}
            </PillButton>
          ))}
          
          {scanResult.linkUpcAvailable && (
            <PillButton
              variant="ceramic"
              onClick={handleLinkUpc}
              icon={<Link2 className="w-4 h-4" />}
              className="w-full"
            >
              Link to Product/Material
            </PillButton>
          )}
          
          {scanResult.availableActions.filter(a => !a.primary).map((action) => (
            <PillButton
              key={action.type}
              variant="glass"
              onClick={() => handleAction(action)}
              disabled={action.disabled}
              className="w-full"
            >
              {action.label}
            </PillButton>
          ))}
        </div>

        {/* Scan another */}
        <PillButton variant="glass" onClick={resetScan} className="w-full">
          Scan Another
        </PillButton>
      </div>
    );
  }

  if (viewState === 'link-upc') {
    // TODO: Implement link UPC flow
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex items-start gap-3">
            <Link2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900">Link UPC</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">{lastScannedValue}</p>
              <p className="text-xs text-gray-500 mt-2">
                Search for a product or material to link this barcode to.
              </p>
            </div>
          </div>
        </CeramicCard>
        
        <GlassCard>
          <p className="text-sm text-gray-500 text-center">
            Link UPC flow coming soon...
          </p>
        </GlassCard>
        
        <PillButton variant="glass" onClick={resetScan} className="w-full">
          Cancel
        </PillButton>
      </div>
    );
  }

  // Default: Scan view
  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('camera')}
          className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors ${
            mode === 'camera' 
              ? 'bg-blue-600 text-white' 
              : 'surface-glass text-gray-700'
          }`}
        >
          Camera
        </button>
        <button
          onClick={() => setMode('paste')}
          className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors ${
            mode === 'paste' 
              ? 'bg-blue-600 text-white' 
              : 'surface-glass text-gray-700'
          }`}
        >
          Paste
        </button>
      </div>

      {/* Camera mode */}
      {mode === 'camera' && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onError={(err) => setError(err)}
        />
      )}

      {/* Paste mode */}
      {mode === 'paste' && (
        <>
          {/* Error state */}
          {error && (
            <CeramicCard variant="warning">
              <div className="flex items-start gap-3">
                <QrCode className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-900">{error}</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Try copying the full URL from your QR code scan.
                  </p>
                </div>
              </div>
            </CeramicCard>
          )}

          {/* Input card */}
          <GlassCard>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              QR URL, token, or barcode
            </label>
            <input
              value={pasteValue}
              onChange={(e) => {
                setPasteValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://…/qr/qr_… or barcode number"
              className="
                w-full px-4 py-3
                min-h-[48px]
                border border-gray-200 rounded-xl
                text-sm text-gray-900
                placeholder:text-gray-400
                focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
                transition-colors
              "
            />

            {/* Token preview */}
            {token && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <QrCode className="w-3.5 h-3.5" />
                <span>Token detected: <code className="font-mono text-gray-700">{token.slice(0, 20)}…</code></span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-4">
              <PillButton
                variant="glass"
                onClick={handlePaste}
                icon={<Clipboard className="w-4 h-4" />}
                className="flex-1"
              >
                Paste
              </PillButton>
              <PillButton
                variant="ceramic"
                onClick={token ? handlePasteGo : () => handleBarcodeScan(pasteValue, 'MANUAL')}
                disabled={!pasteValue}
                iconRight={<ArrowRight className="w-4 h-4" />}
                className="flex-1"
              >
                Go
              </PillButton>
            </div>
          </GlassCard>
        </>
      )}

      {/* Help text */}
      <p className="text-xs text-gray-400 text-center px-4">
        {mode === 'camera' 
          ? 'Point your camera at a QR code or barcode'
          : 'Paste a QR link or barcode number'
        }
      </p>
    </div>
  );
}
