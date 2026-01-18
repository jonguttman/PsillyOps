'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye,
  MessageSquare,
  QrCode,
  Copy,
  ExternalLink,
  MoreVertical,
  Trash2,
  BarChart2,
  Check,
  Mail,
  X,
  Loader2,
  Send
} from 'lucide-react';
import { CatalogLinkStatus } from '@prisma/client';

interface CatalogLink {
  id: string;
  token: string;
  displayName: string | null;
  status: CatalogLinkStatus;
  viewCount: number;
  lastViewedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  catalogUrl: string;
  retailer: { id: string; name: string };
  createdBy: { id: string; name: string };
  _count: {
    productViews: number;
    inquiries: number;
  };
}

interface CatalogLinksClientProps {
  links: CatalogLink[];
}

export function CatalogLinksClient({ links }: CatalogLinksClientProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sharingLink, setSharingLink] = useState<CatalogLink | null>(null);

  const handleCopyLink = async (link: CatalogLink) => {
    await navigator.clipboard.writeText(link.catalogUrl);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this catalog link? It will no longer be accessible.')) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/ops/catalog-links/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        alert('Failed to revoke catalog link');
      }
    } catch (error) {
      alert('Failed to revoke catalog link');
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = {
    ACTIVE: 'bg-green-100 text-green-800',
    EXPIRED: 'bg-gray-100 text-gray-800',
    REVOKED: 'bg-red-100 text-red-800'
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Retailer
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Token
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Views
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Inquiries
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {links.map(link => (
            <tr key={link.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div>
                  <p className="font-medium text-gray-900">
                    {link.displayName || link.retailer.name}
                  </p>
                  {link.displayName && link.displayName !== link.retailer.name && (
                    <p className="text-xs text-gray-500">{link.retailer.name}</p>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                  {link.token}
                </code>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge[link.status]}`}>
                  {link.status}
                </span>
                {link.expiresAt && link.status === 'ACTIVE' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Expires {new Date(link.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Eye className="w-4 h-4" />
                  {link.viewCount}
                </div>
                {link.lastViewedAt && (
                  <p className="text-xs text-gray-400">
                    Last: {new Date(link.lastViewedAt).toLocaleDateString()}
                  </p>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <MessageSquare className="w-4 h-4" />
                  {link._count.inquiries}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <p>{new Date(link.createdAt).toLocaleDateString()}</p>
                <p className="text-xs">by {link.createdBy.name}</p>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-1">
                  {/* Copy link */}
                  <button
                    onClick={() => handleCopyLink(link)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Copy link"
                  >
                    {copiedId === link.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  {/* Open in new tab */}
                  <a
                    href={link.catalogUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Open catalog"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>

                  {/* Share via email */}
                  {link.status === 'ACTIVE' && (
                    <button
                      onClick={() => setSharingLink(link)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Share via email"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  )}

                  {/* QR Code */}
                  <a
                    href={`/api/catalog/${link.token}/qr?size=400`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View QR code"
                  >
                    <QrCode className="w-4 h-4" />
                  </a>

                  {/* Analytics */}
                  <Link
                    href={`/ops/catalog-links/${link.id}`}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View details"
                  >
                    <BarChart2 className="w-4 h-4" />
                  </Link>

                  {/* Revoke */}
                  {link.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleRevoke(link.id)}
                      disabled={deletingId === link.id}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Revoke link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}

          {links.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                No catalog links yet. Create one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Share Modal */}
      {sharingLink && (
        <ShareModal
          link={sharingLink}
          onClose={() => setSharingLink(null)}
        />
      )}
    </div>
  );
}

interface ShareModalProps {
  link: CatalogLink;
  onClose: () => void;
}

function ShareModal({ link, onClose }: ShareModalProps) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/ops/catalog-links/${link.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail,
          recipientName: recipientName || undefined,
          customMessage: customMessage || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send email');
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Share Catalog</h3>
              <p className="text-sm text-gray-500">{link.displayName || link.retailer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {sent ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Email Sent!</h4>
              <p className="text-gray-600 mb-6">
                The catalog link has been sent to {recipientEmail}
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="retailer@example.com"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Name (optional)
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="John"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Custom Message (optional)
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Add a personal message..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !recipientEmail}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
