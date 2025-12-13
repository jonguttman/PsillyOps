'use client';

// Internal QR Scan Page - Phase 3 Operational UX
// Optimized for warehouse / retail use to scan and resolve QR codes

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { QrCode, Camera, Clipboard, ExternalLink, ArrowRight, RefreshCw } from 'lucide-react';

interface QRContext {
  type: 'QR_CONTEXT';
  tokenId: string;
  tokenValue: string;
  entityType: string;
  entityId: string;
  entityName: string;
  entityLink: string | null;
  labelVersion: string | null;
  currentRedirect: {
    type: 'TOKEN' | 'GROUP' | 'DEFAULT';
    url: string;
    ruleName: string | null;
  };
  status: string;
  scanCount: number;
  lastScanned: string | null;
}

interface ResolveResult {
  found: boolean;
  qrContext?: QRContext;
  suggestedActions?: Array<{ action: string; label: string; link: string }>;
  summary?: string;
  message?: string;
}

export default function ScanPage() {
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check camera support
  useEffect(() => {
    setCameraSupported('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices);
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const resolveQR = async (input: string) => {
    if (!input.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/qr-tokens/resolve-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() })
      });

      const data: ResolveResult = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resolve QR');
      }

      setResult(data);

      if (!data.found) {
        setError(data.message || 'No QR token found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resolve QR code');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputValue(text);
      await resolveQR(text);
    } catch {
      setError('Unable to read clipboard. Please paste manually.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    resolveQR(inputValue);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch {
      setError('Unable to access camera');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const reset = () => {
    setInputValue('');
    setResult(null);
    setError(null);
  };

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    REVOKED: 'bg-red-100 text-red-800 border-red-200',
    EXPIRED: 'bg-gray-100 text-gray-600 border-gray-200'
  };

  const resolutionColors: Record<string, string> = {
    TOKEN: 'bg-blue-100 text-blue-800',
    GROUP: 'bg-purple-100 text-purple-800',
    DEFAULT: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scan QR Code</h1>
        <p className="mt-1 text-sm text-gray-600">
          Scan or paste a QR code to view details and take action
        </p>
      </div>

      {/* Input Section */}
      {!result?.found && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          {/* Camera View */}
          {cameraActive && (
            <div className="mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-64 bg-black rounded-lg object-cover"
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                Point camera at QR code. Camera scanning requires a QR scanning library (not implemented).
              </p>
              <button
                onClick={stopCamera}
                className="mt-2 w-full px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
              >
                Stop Camera
              </button>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                QR URL or Token
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Paste QR URL or token (e.g., qr_abc123...)"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="px-4 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  title="Paste from clipboard"
                >
                  <Clipboard className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {cameraSupported && !cameraActive && (
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Camera className="w-5 h-5" />
                  Use Camera
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <QrCode className="w-5 h-5" />
                    Resolve QR
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Result Display */}
      {result?.found && result.qrContext && (
        <div className="space-y-4">
          {/* QR Summary Card */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <QrCode className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {result.qrContext.entityName}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{result.qrContext.entityType}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${statusColors[result.qrContext.status]}`}>
                      {result.qrContext.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={reset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Scan Another
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">{result.summary}</p>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 py-4 border-t border-b border-gray-200">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{result.qrContext.scanCount}</div>
                <div className="text-xs text-gray-500">Total Scans</div>
              </div>
              <div className="text-center">
                <span className={`inline-flex items-center px-2 py-1 rounded text-sm font-medium ${resolutionColors[result.qrContext.currentRedirect.type]}`}>
                  {result.qrContext.currentRedirect.type}
                </span>
                <div className="text-xs text-gray-500 mt-1">Redirect Type</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-900 truncate" title={result.qrContext.labelVersion || 'N/A'}>
                  {result.qrContext.labelVersion || 'N/A'}
                </div>
                <div className="text-xs text-gray-500">Label Version</div>
              </div>
            </div>

            {/* Current Redirect */}
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Current Redirect</h3>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <a
                  href={result.qrContext.currentRedirect.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 truncate flex-1"
                >
                  {result.qrContext.currentRedirect.url}
                </a>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </div>
              {result.qrContext.currentRedirect.ruleName && (
                <p className="text-xs text-gray-500 mt-1">
                  Rule: {result.qrContext.currentRedirect.ruleName}
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href={`/qr/${result.qrContext.tokenId}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
              >
                <QrCode className="w-4 h-4" />
                Open QR Detail
              </Link>
              
              <a
                href={result.qrContext.currentRedirect.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <ExternalLink className="w-4 h-4" />
                Test Redirect
              </a>

              {result.qrContext.entityLink && (
                <Link
                  href={result.qrContext.entityLink}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  View {result.qrContext.entityType}
                </Link>
              )}

              <button
                onClick={() => {
                  // Open AI command bar with QR context
                  // This triggers Cmd+K with the token
                  const event = new KeyboardEvent('keydown', {
                    key: 'k',
                    metaKey: true,
                    bubbles: true
                  });
                  document.dispatchEvent(event);
                  setTimeout(() => {
                    const input = document.querySelector('input[placeholder*="command"]') as HTMLInputElement;
                    if (input) {
                      input.value = result.qrContext!.tokenValue;
                      input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                  }, 100);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Send to AI
              </button>
            </div>
          </div>

          {/* Token Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-xs font-medium text-gray-500 mb-2">Token Details</h3>
            <div className="space-y-1 text-xs text-gray-600">
              <p><strong>Token:</strong> <code className="text-gray-800">{result.qrContext.tokenValue}</code></p>
              <p><strong>Entity ID:</strong> {result.qrContext.entityId}</p>
              <p><strong>Last Scanned:</strong> {result.qrContext.lastScanned ? new Date(result.qrContext.lastScanned).toLocaleString() : 'Never'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      {!result?.found && !error && (
        <div className="text-center text-sm text-gray-500 mt-8">
          <p>Scan a QR code or paste a URL like:</p>
          <code className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
            https://psillyops.com/qr/qr_abc123xyz...
          </code>
        </div>
      )}
    </div>
  );
}

