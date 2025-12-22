'use client';

/**
 * BindClient - Main orchestrator for mobile batch binding
 * 
 * Flow:
 * 1. Start Session - Select product, start session
 * 2. Active Session - Scanner, timer, scan count, last 5 scans
 * 3. Rebind Modal - Confirmation when rebind detected
 * 4. Session End - Summary screen
 */

import { useState, useEffect, useCallback } from 'react';
import { SessionTimer } from './SessionTimer';
import { ScannerView } from './ScannerView';
import { RebindModal } from './RebindModal';
import { triggerScanFeedback, initAudio, type ScanOutcome } from '@/lib/utils/scanFeedback';

interface PartnerProduct {
  id: string;
  name: string;
  sku: string | null;
}

interface BindingSession {
  id: string;
  partnerId: string;
  partnerProductId: string;
  startedAt: string;
  expiresAt: string;
  status: string;
  scanCount: number;
  partnerProduct: PartnerProduct;
}

interface RebindInfo {
  tokenId: string;
  existingBindingId: string;
  previousProduct: {
    id: string;
    name: string;
    sku?: string | null;
  };
  currentProduct: {
    id: string;
    name: string;
    sku?: string | null;
  };
}

interface RecentScan {
  tokenShortHash: string;
  timestamp: string;
  status: 'bound' | 'rebound' | 'already_bound';
}

interface BindClientProps {
  products: PartnerProduct[];
  initialSession: BindingSession | null;
}

export function BindClient({ products, initialSession }: BindClientProps) {
  const [session, setSession] = useState<BindingSession | null>(initialSession);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [rebindInfo, setRebindInfo] = useState<RebindInfo | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [finalScanCount, setFinalScanCount] = useState(0);

  // Initialize audio on mount
  useEffect(() => {
    initAudio();
  }, []);

  // Poll for session updates
  useEffect(() => {
    if (!session || sessionEnded) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/partner/session');
        const data = await res.json();
        
        if (!data.session) {
          // Session expired
          triggerScanFeedback('session_expired', audioEnabled);
          setFinalScanCount(session.scanCount);
          setSession(null);
          setSessionEnded(true);
        } else {
          setSession(data.session);
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [session, audioEnabled, sessionEnded]);

  const startSession = async () => {
    if (!selectedProductId) {
      setError('Please select a product');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const res = await fetch('/api/partner/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerProductId: selectedProductId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start session');
      }

      setSession(data.session);
      setRecentScans([]);
      setSessionEnded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsStarting(false);
    }
  };

  const endSession = async () => {
    if (!session) return;

    try {
      const res = await fetch(`/api/partner/session?sessionId=${session.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to end session');
      }

      triggerScanFeedback('session_expired', audioEnabled);
      setFinalScanCount(session.scanCount);
      setSession(null);
      setSessionEnded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session');
    }
  };

  const handleScan = useCallback(async (scannedValue: string) => {
    if (!session || scannerPaused) return;

    try {
      const res = await fetch('/api/partner/bind-from-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: scannedValue }),
      });

      const data = await res.json();

      if (data.status === 'bound') {
        triggerScanFeedback('bound', audioEnabled);
        addRecentScan(data.tokenShortHash, 'bound');
        // Update local scan count
        setSession(prev => prev ? { ...prev, scanCount: prev.scanCount + 1 } : null);
      } else if (data.status === 'already_bound') {
        // No-op success - same product, just haptic feedback
        triggerScanFeedback('already_bound', audioEnabled);
        // Don't add to recent scans, don't increment count
      } else if (data.status === 'rebind_required') {
        triggerScanFeedback('rebind_required', audioEnabled);
        setScannerPaused(true);
        setRebindInfo({
          tokenId: data.tokenId,
          existingBindingId: data.existingBindingId,
          previousProduct: data.previousProduct,
          currentProduct: data.currentProduct,
        });
      } else if (data.status === 'error') {
        triggerScanFeedback('error', audioEnabled);
        // Silent error - continue scanning
      }
    } catch {
      triggerScanFeedback('error', audioEnabled);
    }
  }, [session, scannerPaused, audioEnabled]);

  const handleRebindConfirm = async () => {
    if (!rebindInfo || !session) return;

    try {
      const res = await fetch('/api/partner/confirm-rebind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: rebindInfo.tokenId,
          existingBindingId: rebindInfo.existingBindingId,
        }),
      });

      const data = await res.json();

      if (data.status === 'rebound') {
        triggerScanFeedback('bound', audioEnabled);
        addRecentScan(data.tokenShortHash, 'rebound');
        setSession(prev => prev ? { ...prev, scanCount: prev.scanCount + 1 } : null);
      }
    } catch {
      // Error handling
    } finally {
      setRebindInfo(null);
      setScannerPaused(false);
    }
  };

  const handleRebindCancel = async () => {
    // Log cancellation (optional - could add API call)
    setRebindInfo(null);
    setScannerPaused(false);
  };

  const addRecentScan = (tokenShortHash: string, status: 'bound' | 'rebound' | 'already_bound') => {
    const newScan: RecentScan = {
      tokenShortHash,
      timestamp: new Date().toLocaleTimeString(),
      status,
    };
    setRecentScans(prev => [newScan, ...prev.slice(0, 4)]);
  };

  const handleSessionExpired = () => {
    triggerScanFeedback('session_expired', audioEnabled);
    if (session) {
      setFinalScanCount(session.scanCount);
    }
    setSession(null);
    setSessionEnded(true);
  };

  const resetToStart = () => {
    setSessionEnded(false);
    setFinalScanCount(0);
    setRecentScans([]);
    setSelectedProductId('');
  };

  // Session ended summary
  if (sessionEnded) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Session Complete</h2>
          <p className="text-3xl font-bold text-blue-600 mb-4">{finalScanCount} seals bound</p>
          <button
            onClick={resetToStart}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  // Active session
  if (session) {
    return (
      <div className="space-y-4">
        {/* Session Header */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{session.partnerProduct.name}</h2>
              {session.partnerProduct.sku && (
                <p className="text-sm text-gray-500">SKU: {session.partnerProduct.sku}</p>
              )}
            </div>
            <SessionTimer
              expiresAt={session.expiresAt}
              onExpired={handleSessionExpired}
            />
          </div>
          
          <div className="flex justify-between items-center">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{session.scanCount}</p>
              <p className="text-xs text-gray-500">seals bound</p>
            </div>
            
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={audioEnabled}
                  onChange={(e) => setAudioEnabled(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-600">Sound</span>
              </label>
              
              <button
                onClick={endSession}
                className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-200"
              >
                End Session
              </button>
            </div>
          </div>
        </div>

        {/* Scanner */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <ScannerView
            onScan={handleScan}
            paused={scannerPaused}
          />
        </div>

        {/* Last 5 Scans */}
        {recentScans.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Scans</h3>
            <ul className="space-y-1">
              {recentScans.map((scan, index) => (
                <li key={index} className="flex justify-between text-sm">
                  <span className="font-mono text-gray-600">...{scan.tokenShortHash}</span>
                  <span className="text-gray-400">{scan.timestamp}</span>
                  {scan.status === 'rebound' && (
                    <span className="text-amber-600 text-xs">(rebound)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rebind Modal */}
        {rebindInfo && (
          <RebindModal
            previousProduct={rebindInfo.previousProduct}
            currentProduct={rebindInfo.currentProduct}
            onConfirm={handleRebindConfirm}
            onCancel={handleRebindCancel}
          />
        )}
      </div>
    );
  }

  // Start session screen
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bind Seals</h1>
        <p className="mt-1 text-sm text-gray-600">
          Select a product and start a labeling session
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Product
        </label>
        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Choose a product...</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} {product.sku && `(${product.sku})`}
            </option>
          ))}
        </select>

        <button
          onClick={startSession}
          disabled={!selectedProductId || isStarting}
          className="w-full mt-4 bg-blue-600 text-white py-4 rounded-lg text-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStarting ? 'Starting...' : 'Start Labeling Session'}
        </button>

        <p className="mt-3 text-center text-sm text-gray-500">
          Session lasts 5 minutes
        </p>
      </div>

      {products.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            No products available. Create products first before binding seals.
          </p>
        </div>
      )}
    </div>
  );
}

