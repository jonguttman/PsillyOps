'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, Clipboard, ArrowRight, Camera } from 'lucide-react';
import { GlassCard, CeramicCard, PillButton } from '@/components/mobile';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

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
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => extractToken(value), [value]);

  const go = useCallback(() => {
    setError(null);
    const t = extractToken(value);
    if (!t) {
      setError('Paste a /qr/{token} URL or a qr_ token.');
      trackEvent('scan_failure', { error: 'invalid_token' });
      return;
    }

    trackEvent('scan_success', { tokenId: t });
    // Canonical scan flow: /qr/{token} → resolver → destination (logs + overrides)
    router.push(`/qr/${t}`);
  }, [router, value]);

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
      setError(null);
      trackEvent('scan_paste', { hasContent: !!text });
    } catch {
      setError('Unable to read clipboard. Please paste manually.');
      trackEvent('scan_failure', { error: 'clipboard_access' });
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Camera placeholder - Phase 2 will implement actual camera */}
      <GlassCard className="!p-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="
            w-20 h-20 mb-4
            rounded-2xl
            bg-gray-100
            flex items-center justify-center
          ">
            <Camera className="w-10 h-10 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500">
            Camera scanning coming soon
          </p>
          <p className="text-xs text-gray-400 mt-1">
            For now, paste a QR link below
          </p>
        </div>
      </GlassCard>

      {/* Error state - replaces content when present */}
      {error ? (
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
      ) : null}

      {/* Input card */}
      <GlassCard>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          QR URL or token
        </label>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="https://…/qr/qr_… or qr_…"
          className="
            w-full px-4 py-3
            min-h-[48px]
            border border-gray-200 rounded-xl
            text-sm text-gray-900
            placeholder:text-gray-400
            focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
            transition-all duration-[var(--transition-fast)]
          "
          // No autoFocus - causes keyboard issues on mobile
        />

        {/* Token preview */}
        {token && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <QrCode className="w-3.5 h-3.5" />
            <span>Token detected: <code className="font-mono text-gray-700">{token.slice(0, 20)}…</code></span>
          </div>
        )}

        {/* Action buttons - 8px gap, 44px min height */}
        <div className="flex gap-2 mt-4">
          <PillButton
            variant="glass"
            onClick={paste}
            icon={<Clipboard className="w-4 h-4" />}
            className="flex-1"
          >
            Paste
          </PillButton>
          <PillButton
            variant="ceramic"
            onClick={go}
            disabled={!token}
            iconRight={<ArrowRight className="w-4 h-4" />}
            className="flex-1"
          >
            Go
          </PillButton>
        </div>
      </GlassCard>

      {/* Help text */}
      <p className="text-xs text-gray-400 text-center px-4">
        Scan a QR code with your camera app, then paste the link here.
        You&apos;ll be redirected through the QR resolver.
      </p>
    </div>
  );
}

