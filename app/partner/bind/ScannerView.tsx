'use client';

/**
 * ScannerView - QR code scanner using html5-qrcode
 * 
 * Features:
 * - Camera opens immediately on mount
 * - Debounced scanning to prevent double-triggers
 * - Pause/resume capability for rebind modal
 * - Graceful error handling
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface ScannerViewProps {
  onScan: (value: string) => void;
  paused: boolean;
}

export function ScannerView({ onScan, paused }: ScannerViewProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const containerId = 'qr-scanner-container';

  // Debounce interval in ms (prevent same code scanning twice quickly)
  const DEBOUNCE_MS = 2000;

  const handleScanSuccess = useCallback((decodedText: string) => {
    const now = Date.now();
    
    // Debounce: skip if same code scanned within debounce window
    if (
      decodedText === lastScanRef.current &&
      now - lastScanTimeRef.current < DEBOUNCE_MS
    ) {
      return;
    }

    lastScanRef.current = decodedText;
    lastScanTimeRef.current = now;
    
    onScan(decodedText);
  }, [onScan]);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      if (scannerRef.current) return;

      try {
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          handleScanSuccess,
          () => {
            // Ignore scan errors (no QR found in frame)
          }
        );

        if (mounted) {
          setIsStarted(true);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Camera access failed';
          setError(message);
          console.error('Scanner error:', err);
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {
          // Ignore stop errors
        });
        scannerRef.current = null;
      }
    };
  }, [handleScanSuccess]);

  // Handle pause/resume
  useEffect(() => {
    if (!scannerRef.current || !isStarted) return;

    if (paused) {
      scannerRef.current.pause(true);
    } else {
      scannerRef.current.resume();
    }
  }, [paused, isStarted]);

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Camera Access Required</h3>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div 
        id={containerId} 
        className="w-full"
        style={{ minHeight: '300px' }}
      />
      
      {paused && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg px-4 py-2">
            <span className="text-gray-700 font-medium">Scanner Paused</span>
          </div>
        </div>
      )}
      
      {!isStarted && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Starting camera...</p>
          </div>
        </div>
      )}
    </div>
  );
}

