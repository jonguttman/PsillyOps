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
 * 
 * Safari Camera Release Fix:
 * - Captures scanner controls from ZXing's decodeFromVideoDevice
 * - Calls controls.stop() during teardown to properly release camera
 * - Captures video element reference before cleanup (React clears refs early)
 * - Disables tracks before stopping them (Safari requirement)
 * - Calls video.load() to force WebKit media pipeline release
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, X } from 'lucide-react';
import { GlassCard, CeramicCard, PillButton, LiquidGlassSwitch } from '@/components/mobile';

// Lazy import ZXing to avoid SSR issues
let BrowserMultiFormatReader: typeof import('@zxing/browser').BrowserMultiFormatReader | null = null;

type ScannerState = 'idle' | 'requesting' | 'scanning' | 'paused' | 'error';

interface BarcodeScannerProps {
  onScan: (value: string, format: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
  autoStart?: boolean;
}

// Extend MediaTrackCapabilities to include zoom and torch (not in standard TS types)
interface CameraCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
}

// Combined constraint set for zoom and torch (extends MediaTrackConstraintSet for type compatibility)
interface CameraConstraintSet extends MediaTrackConstraintSet {
  zoom?: number;
  torch?: boolean;
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
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  // Scanner controls returned by ZXing's decodeFromVideoDevice - MUST call stop() to release camera
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  
  const [state, setState] = useState<ScannerState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastScannedValue, setLastScannedValue] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  
  // Zoom state
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [currentZoom, setCurrentZoom] = useState(1);
  
  // Torch state
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Compute preset zoom values (clamped to maxZoom)
  const presets = useMemo(() => {
    if (!supportsZoom) return null;
    
    return {
      x2: Math.min(2, maxZoom),
      x4: Math.min(4, maxZoom),
      max: maxZoom,
    };
  }, [supportsZoom, maxZoom]);

  // Only show presets if maxZoom >= 2
  const showPresets = presets && maxZoom >= 2;

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

  // Apply zoom to video track
  const applyZoom = useCallback(async (value: number) => {
    if (!videoTrackRef.current || !supportsZoom) return;
    
    const clamped = Math.min(Math.max(value, minZoom), maxZoom);
    
    try {
      await videoTrackRef.current.applyConstraints({
        advanced: [{ zoom: clamped } as CameraConstraintSet],
      });
      setCurrentZoom(clamped);
    } catch (err) {
      console.error('Failed to apply zoom:', err);
    }
  }, [supportsZoom, minZoom, maxZoom]);

  // Toggle torch (flashlight)
  const toggleTorch = useCallback(async (next?: boolean) => {
    if (!videoTrackRef.current || !supportsTorch) return;
    
    const target = typeof next === 'boolean' ? next : !torchOn;
    
    try {
      await videoTrackRef.current.applyConstraints({
        advanced: [{ torch: target } as CameraConstraintSet],
      });
      setTorchOn(target);
    } catch (err) {
      console.error('Failed to toggle torch:', err);
    }
  }, [supportsTorch, torchOn]);

  // Debounced slider handler (75ms debounce to prevent constraint thrashing)
  const handleSliderChange = useCallback((value: number) => {
    // Update UI immediately for responsive feel
    setCurrentZoom(value);
    
    // Debounce actual zoom application
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = window.setTimeout(() => {
      applyZoom(value);
    }, 75);
  }, [applyZoom]);

  // Teardown guard to prevent race conditions
  const teardownInProgressRef = useRef(false);

  // Stop camera stream and reader (Safari-safe teardown)
  const stopStream = useCallback(() => {
    teardownInProgressRef.current = true;

    // 1. Stop ZXing decode loop via scanner controls (CRITICAL for Safari)
    if (scannerControlsRef.current) {
      try {
        scannerControlsRef.current.stop();
      } catch {}
      scannerControlsRef.current = null;
    }
    readerRef.current = null;

    // 2. Disable and stop all media tracks (disable FIRST for Safari)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.enabled = false;
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    // 3. Fully detach video element (Safari requires load() call)
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.removeAttribute('src');
        videoRef.current.load(); // Forces WebKit media pipeline release
      } catch {}
    }

    // 4. Clear remaining refs
    videoTrackRef.current = null;

    // 5. Release teardown guard after short delay (race condition prevention)
    setTimeout(() => {
      teardownInProgressRef.current = false;
    }, 100);
  }, []);

  // Start scanning
  const startScanning = useCallback(async () => {
    // Guard against race condition with teardown
    if (teardownInProgressRef.current) {
      return;
    }

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
      
      // Detect zoom and torch capabilities
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;
      const capabilities = track.getCapabilities?.() as CameraCapabilities | undefined;
      
      if (capabilities && 
          typeof capabilities.zoom?.min === 'number' && 
          typeof capabilities.zoom?.max === 'number') {
        setSupportsZoom(true);
        setMinZoom(capabilities.zoom.min);
        setMaxZoom(capabilities.zoom.max);
        setCurrentZoom(capabilities.zoom.min);
      } else {
        setSupportsZoom(false);
      }
      
      // Detect torch capability
      if (capabilities?.torch === true) {
        setSupportsTorch(true);
        setTorchOn(false);
      } else {
        setSupportsTorch(false);
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      setState('scanning');
      trackEvent('scanner_started', { facingMode });
      
      // Start continuous decoding and capture scanner controls
      const controls = await reader.decodeFromVideoDevice(
        undefined, // Use default device
        videoRef.current!,
        async (result) => {
          if (result) {
            const value = result.getText();
            const format = result.getBarcodeFormat().toString();
            
            // Avoid duplicate scans
            if (value !== lastScannedValue) {
              setLastScannedValue(value);
              setState('paused');
              
              // Reset torch before stopping stream (while track is still valid)
              if (supportsTorch && torchOn && videoTrackRef.current) {
                try {
                  await videoTrackRef.current.applyConstraints({
                    advanced: [{ torch: false } as CameraConstraintSet],
                  });
                  setTorchOn(false);
                } catch (err) {
                  console.error('Failed to reset torch:', err);
                }
              }
              
              // Reset zoom before stopping stream (while track is still valid)
              if (supportsZoom && videoTrackRef.current) {
                await applyZoom(minZoom);
              }
              
              stopStream();
              trackEvent('scan_success', { format, valueLength: value.length });
              onScan(value, format);
            }
          }
          // Ignore decode errors (expected when no barcode in view)
        }
      );
      
      // Store scanner controls for proper cleanup
      scannerControlsRef.current = controls;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera access failed';
      setErrorMessage(message);
      setState('error');
      trackEvent('scanner_error', { error: message });
      onError?.(message);
    }
  }, [initReader, facingMode, lastScannedValue, onScan, onError, stopStream, supportsZoom, minZoom, applyZoom, supportsTorch, torchOn]);

  // Resume scanning after a successful scan
  const resumeScanning = useCallback(() => {
    setLastScannedValue(null);
    // Reset zoom state for next scan
    if (supportsZoom) {
      setCurrentZoom(minZoom);
    }
    // Reset torch state for next scan
    if (supportsTorch) {
      setTorchOn(false);
    }
    startScanning();
  }, [startScanning, supportsZoom, minZoom, supportsTorch]);

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

  // Cleanup on unmount - capture video element before React clears refs
  useEffect(() => {
    // Capture the video element NOW, before cleanup runs
    const videoElement = videoRef.current;
    
    return () => {
      // Perform Safari-safe teardown with captured video element
      teardownInProgressRef.current = true;

      // 1. Stop ZXing decode loop via scanner controls (CRITICAL for Safari)
      if (scannerControlsRef.current) {
        try {
          scannerControlsRef.current.stop();
        } catch {}
        scannerControlsRef.current = null;
      }
      readerRef.current = null;

      // 2. Disable and stop all media tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try {
            track.enabled = false;
            track.stop();
          } catch {}
        });
        streamRef.current = null;
      }

      // 3. Fully detach video element using CAPTURED reference (not ref)
      if (videoElement) {
        try {
          videoElement.pause();
          videoElement.srcObject = null;
          videoElement.removeAttribute('src');
          videoElement.load(); // Forces WebKit media pipeline release
        } catch {}
      }

      // 4. Clear remaining refs
      videoTrackRef.current = null;

      // Clear debounce timer
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      teardownInProgressRef.current = false;
    };
  }, []); // Empty deps - only run on mount/unmount

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
      
      {/* Camera Controls - Only show when scanning and zoom or torch is supported */}
      {state === 'scanning' && (supportsZoom || supportsTorch) && (
        <GlassCard className="!p-4 space-y-4">
          {/* Zoom Controls - Only show if zoom is supported */}
          {supportsZoom && (
            <>
              {/* Preset Buttons - Only show if maxZoom >= 2 */}
              {showPresets && presets && (
                <div className="flex gap-2">
                  <button
                    onClick={() => applyZoom(presets.x2)}
                    className={`
                      flex-1 px-4 py-3 rounded-full text-sm font-medium
                      min-h-[44px] flex items-center justify-center
                      transition-colors
                      ${Math.abs(currentZoom - presets.x2) < 0.15
                        ? 'bg-blue-600 text-white'
                        : 'surface-glass text-gray-700'}
                    `}
                  >
                    2×
                  </button>
                  <button
                    onClick={() => applyZoom(presets.x4)}
                    className={`
                      flex-1 px-4 py-3 rounded-full text-sm font-medium
                      min-h-[44px] flex items-center justify-center
                      transition-colors
                      ${Math.abs(currentZoom - presets.x4) < 0.15
                        ? 'bg-blue-600 text-white'
                        : 'surface-glass text-gray-700'}
                    `}
                  >
                    4×
                  </button>
                  <button
                    onClick={() => applyZoom(presets.max)}
                    className={`
                      flex-1 px-4 py-3 rounded-full text-sm font-medium
                      min-h-[44px] flex items-center justify-center
                      transition-colors
                      ${Math.abs(currentZoom - presets.max) < 0.15
                        ? 'bg-blue-600 text-white'
                        : 'surface-glass text-gray-700'}
                    `}
                  >
                    MAX
                  </button>
                </div>
              )}
              
              {/* Zoom Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{minZoom.toFixed(1)}×</span>
                  <span>{maxZoom.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={minZoom}
                  max={maxZoom}
                  step={0.1}
                  value={currentZoom}
                  onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </>
          )}
          
          {/* Divider - Only show if both zoom and torch are supported */}
          {supportsZoom && supportsTorch && (
            <div className="h-px bg-white/20" />
          )}
          
          {/* Light Switch - Only show if torch is supported */}
          {supportsTorch && (
            <div className="flex items-center justify-between min-h-[44px]">
              <span className="text-sm text-gray-600">Light</span>
              <LiquidGlassSwitch
                checked={torchOn}
                onChange={(next) => toggleTorch(next)}
              />
            </div>
          )}
        </GlassCard>
      )}
      
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
