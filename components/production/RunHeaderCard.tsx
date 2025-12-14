'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { ProductionRunApiDetail } from '@/components/production/ProductionRunClient';

function badgeColors(status: string) {
  switch (status) {
    case 'PLANNED':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'COMPLETED':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export default function RunHeaderCard({ run }: { run: ProductionRunApiDetail['run'] }) {
  const qrUrl = run.qr?.url || null;
  const qrToken = run.qr?.token || null;

  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const canShowQr = !!qrUrl;

  useEffect(() => {
    if (!showQr || !qrUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(qrUrl, { width: 256, margin: 2 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showQr, qrUrl]);

  const onCopy = useCallback(async () => {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
    } catch {
      // ignore
    }
  }, [qrUrl]);

  const createdAt = useMemo(() => new Date(run.createdAt).toLocaleString(), [run.createdAt]);

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-gray-900 truncate">{run.product.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeColors(run.status)}`}>
              {run.status}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-700">
            Qty <span className="font-semibold">{run.quantity}</span>{' '}
            <span className="text-gray-400">• {run.product.sku}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">Created {createdAt}</div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-gray-200 p-3">
        <div className="text-xs font-medium text-gray-500">Run QR</div>
        {qrUrl ? (
          <>
            <div className="mt-1 font-mono text-xs text-gray-700 break-all">{qrUrl}</div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={onCopy}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md bg-gray-900 text-white text-sm font-medium"
              >
                Copy link
              </button>
              <button
                onClick={() => setShowQr(true)}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium"
                disabled={!canShowQr}
              >
                Open on phone
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Scan flow is always <span className="font-mono">/qr/{'{token}'}</span> → resolver → run page.
              {qrToken ? (
                <>
                  {' '}
                  Token: <span className="font-mono">{qrToken}</span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-gray-500">No QR token on this run.</div>
        )}
      </div>

      {/* QR Modal */}
      {showQr ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Open on phone</div>
              <button
                onClick={() => setShowQr(false)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-gray-500">Scan this QR code</div>
              <div className="flex justify-center">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Run QR" className="w-64 h-64 border border-gray-200 rounded-md" />
                ) : (
                  <div className="w-64 h-64 border border-gray-200 rounded-md flex items-center justify-center text-sm text-gray-500">
                    Generating…
                  </div>
                )}
              </div>
              {qrUrl ? <div className="font-mono text-[11px] text-gray-600 break-all">{qrUrl}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

