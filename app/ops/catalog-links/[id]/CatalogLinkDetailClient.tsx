'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, Copy, ExternalLink, Check, Trash2 } from 'lucide-react';
import { CatalogLinkStatus } from '@prisma/client';

interface CatalogLinkDetailClientProps {
  catalogUrl: string;
  token: string;
  status: CatalogLinkStatus;
  linkId: string;
}

export function CatalogLinkDetailClient({
  catalogUrl,
  token,
  status,
  linkId
}: CatalogLinkDetailClientProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(catalogUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this catalog link? It will no longer be accessible.')) {
      return;
    }

    setRevoking(true);
    try {
      const res = await fetch(`/api/ops/catalog-links/${linkId}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        alert('Failed to revoke catalog link');
      }
    } catch (error) {
      alert('Failed to revoke catalog link');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Copy link */}
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied!' : 'Copy Link'}
      </button>

      {/* Open catalog */}
      <a
        href={catalogUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Open Catalog
      </a>

      {/* QR Code */}
      <a
        href={`/api/catalog/${token}/qr?size=400`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <QrCode className="w-4 h-4" />
        QR Code
      </a>

      {/* Revoke */}
      {status === 'ACTIVE' && (
        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {revoking ? 'Revoking...' : 'Revoke'}
        </button>
      )}
    </div>
  );
}
