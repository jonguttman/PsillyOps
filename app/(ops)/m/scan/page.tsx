'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

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
      return;
    }

    // Canonical scan flow: /qr/{token} → resolver → destination (logs + overrides)
    router.push(`/qr/${t}`);
  }, [router, value]);

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
      setError(null);
    } catch {
      setError('Unable to read clipboard. Please paste manually.');
    }
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Scan</h1>
        <p className="mt-1 text-sm text-gray-600">
          Paste a run QR link or token. You’ll be redirected through the QR resolver.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-4 space-y-3">
        <label className="block text-xs font-medium text-gray-500">QR URL or token</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://…/qr/qr_… or qr_…"
          className="w-full px-3 py-3 border border-gray-300 rounded-md text-sm"
        />

        {error ? <div className="text-sm text-red-700">{error}</div> : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={paste}
            className="inline-flex items-center justify-center px-3 py-3 rounded-md bg-gray-100 text-gray-800 text-sm font-semibold"
          >
            Paste
          </button>
          <button
            onClick={go}
            disabled={!token}
            className="inline-flex items-center justify-center px-3 py-3 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}

