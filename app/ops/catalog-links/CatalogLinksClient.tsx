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
  Check
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
    </div>
  );
}
