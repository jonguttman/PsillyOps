'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, Copy, ExternalLink, Check, Trash2, FileText, ChevronDown } from 'lucide-react';
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
  const [generatingIntroSheet, setGeneratingIntroSheet] = useState(false);
  const [showIntroSheetMenu, setShowIntroSheetMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowIntroSheetMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleGenerateIntroSheet = async (format: 'full' | 'half' = 'full') => {
    setGeneratingIntroSheet(true);
    setShowIntroSheetMenu(false);
    try {
      const res = await fetch('/api/ops/intro-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogLinkId: linkId, format })
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || 'Failed to generate intro sheet');
        return;
      }

      // Download the PDF
      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = format === 'half' ? 'intro-sheet-half.pdf' : 'intro-sheet.pdf';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert('Failed to generate intro sheet');
    } finally {
      setGeneratingIntroSheet(false);
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

      {/* Generate Intro Sheet - Dropdown */}
      {status === 'ACTIVE' && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowIntroSheetMenu(!showIntroSheetMenu)}
            disabled={generatingIntroSheet}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {generatingIntroSheet ? 'Generating...' : 'Intro Sheet'}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showIntroSheetMenu && !generatingIntroSheet && (
            <div className="absolute z-10 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg">
              <button
                onClick={() => handleGenerateIntroSheet('full')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
              >
                Full Page (8.5" × 11")
              </button>
              <button
                onClick={() => handleGenerateIntroSheet('half')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg border-t border-gray-100"
              >
                Half Page Leave-Behind
              </button>
            </div>
          )}
        </div>
      )}

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
