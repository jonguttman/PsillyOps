'use client';

/**
 * BarcodeScanner Component
 * 
 * Web-based barcode scanner using @zxing/browser.
 * Supports QR, UPC-A, UPC-E, EAN-13, EAN-8, Code 128.
 * 
 * Design:
 * - Camera view is NOT blurred
 * - Glass UI overlays outside camera surface
 * - Ceramic warning surface for errors
 * - Pauses camera after successful scan
 * - User-initiated camera start
 * - Works in iOS Safari (HTTPS required)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, X } from 'lucide-react';
import { GlassCard, CeramicCard, PillButton } from '@/components/mobile';

// Lazy import ZXing to avoid SSR issues
let BrowserMultiFormatReader: typeof import('@zxing/browser').BrowserMultiFormatReader | null = null;

type ScannerState = 'idle' | 'requesting' | 'scanning' | 'paused' | 'error';

interface BarcodeScannerProps {
  onScan: (value: string, format: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
  autoStart?: boolean;
}

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

export default function BarcodeScanner({
  onScan,
  onError,
  onClose,
  autoStart = false,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<InstanceType<typeof import('@zxing/browser').BrowserMultiFormatReader> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [state, setState] = useState<ScannerState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastScannedValue, setLastScannedValue] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  // Initialize ZXing reader
  const initReader = useCallback(async () => {
    if (!BrowserMultiFormatReader) {
      const zxing = await import('@zxing/browser');
      BrowserMultiFormatReader = zxing.BrowserMultiFormatReader;
    }
    
    if (!readerRef.current) {
      readerRef.current = new BrowserMultiFormatReader();
    }
    
    return readerRef.current;
  }, []);

  // Stop camera stream and reader
  const stopStream = useCallback(() => {
    // Stop all camera tracks (stopping the stream stops ZXing decoding automatically)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    
    // Clear video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
    }
    
    // Clear reader reference (ZXing will stop when stream stops)
    readerRef.current = null;
  }, []);

  // Start scanning
  const startScanning = useCallback(async () => {
    setState('requesting');
    setErrorMessage(null);
    
    try {
      const reader = await initReader();
      
      // Request camera access
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setState('scanning');
      trackEvent('scanner_started', { facingMode });
      
      // Start continuous decoding
      reader.decodeFromVideoDevice(
        undefined, // Use default device
        videoRef.current!,
        (result, error) => {
          if (result) {
            const value = result.getText();
            const format = result.getBarcodeFormat().toString();
            
            // Avoid duplicate scans
            if (value !== lastScannedValue) {
              setLastScannedValue(value);
              setState('paused');
              stopStream();
              trackEvent('scan_success', { format, valueLength: value.length });
              onScan(value, format);
            }
          }
          // Ignore decode errors (expected when no barcode in view)
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access failed';
      setErrorMessage(message);
      setState('error');
      trackEvent('scanner_error', { error: message });
      onError?.(message);
    }
  }, [initReader, facingMode, lastScannedValue, onScan, onError, stopStream]);

  // Resume scanning after a successful scan
  const resumeScanning = useCallback(() => {
    setLastScannedValue(null);
    startScanning();
  }, [startScanning]);

  // Switch camera (front/back)
  const switchCamera = useCallback(() => {
    stopStream();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, [stopStream]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && state === 'idle') {
      startScanning();
    }
  }, [autoStart, state, startScanning]);

  // Restart when facing mode changes
  useEffect(() => {
    if (state === 'scanning') {
      stopStream();
      startScanning();
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      // BrowserMultiFormatReader doesn't have a reset method, just stop the stream
      readerRef.current = null;
    };
  }, [stopStream]);

  // Respect reduced motion
  const prefersReducedMotion = typeof window !== 'undefined' 
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="space-y-4">
      {/* Camera viewport */}
      <div className="relative aspect-[4/3] bg-black rounded-2xl overflow-hidden">
        {/* Video element - NOT blurred */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        
        {/* Scanning overlay - Glass frame around edges */}
        {state === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Corner brackets */}
            <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-white/80 rounded-tl-lg" />
            <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-white/80 rounded-tr-lg" />
            <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-white/80 rounded-bl-lg" />
            <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-white/80 rounded-br-lg" />
            
            {/* Scan line animation */}
            {!prefersReducedMotion && (
              <div 
                className="absolute left-8 right-8 h-0.5 bg-blue-400/60"
                style={{
                  animation: 'scanLine 2s ease-in-out infinite',
                  top: '50%',
                }}
              />
            )}
          </div>
        )}
        
        {/* Idle state */}
        {state === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80">
            <Camera className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-white/80 text-sm mb-4">Tap to start camera</p>
            <PillButton variant="ceramic" onClick={startScanning}>
              Start Scanning
            </PillButton>
          </div>
        )}
        
        {/* Requesting permission */}
        {state === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80">
            <RefreshCw className="w-12 h-12 text-blue-400 mb-4 animate-spin" />
            <p className="text-white/80 text-sm">Requesting camera access...</p>
          </div>
        )}
        
        {/* Paused after scan */}
        {state === 'paused' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/60">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white/80 text-sm mb-4">Barcode detected!</p>
            <PillButton variant="glass" onClick={resumeScanning}>
              Scan Another
            </PillButton>
          </div>
        )}
        
        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-10 h-10 rounded-full surface-glass flex items-center justify-center"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        )}
        
        {/* Camera switch button */}
        {state === 'scanning' && (
          <button
            onClick={switchCamera}
            className="absolute bottom-3 right-3 w-10 h-10 rounded-full surface-glass flex items-center justify-center"
            aria-label="Switch camera"
          >
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
        )}
      </div>
      
      {/* Error state */}
      {state === 'error' && errorMessage && (
        <CeramicCard variant="warning">
          <div className="flex items-start gap-3">
            <CameraOff className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">Camera Error</p>
              <p className="text-xs text-amber-700 mt-1">{errorMessage}</p>
              <div className="mt-3">
                <PillButton variant="glass" onClick={startScanning}>
                  Try Again
                </PillButton>
              </div>
            </div>
          </div>
        </CeramicCard>
      )}
      
      {/* Supported formats hint */}
      {state === 'idle' && (
        <GlassCard className="!p-3">
          <p className="text-xs text-gray-500 text-center">
            Supports QR codes, UPC, EAN-13, and Code 128 barcodes
          </p>
        </GlassCard>
      )}
      
      {/* CSS for scan line animation */}
      <style jsx>{`
        @keyframes scanLine {
          0%, 100% { transform: translateY(-60px); opacity: 0.6; }
          50% { transform: translateY(60px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

