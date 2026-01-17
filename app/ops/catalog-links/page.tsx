/**
 * Catalog Links Management Page
 *
 * Admin interface for managing retailer catalog links.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { buildCatalogUrl } from '@/lib/services/catalogLinkService';
import { Plus, Link as LinkIcon, Eye, MessageSquare, QrCode, Copy, ExternalLink } from 'lucide-react';
import { CatalogLinkStatus } from '@prisma/client';
import { CatalogLinksClient } from './CatalogLinksClient';

async function getCatalogLinks() {
  const links = await prisma.catalogLink.findMany({
    include: {
      retailer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: {
        select: {
          productViews: true,
          inquiries: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return links.map(link => ({
    ...link,
    catalogUrl: buildCatalogUrl(link.token)
  }));
}

async function getStats() {
  const [totalLinks, activeLinks, totalViews, totalInquiries, newInquiries] = await Promise.all([
    prisma.catalogLink.count(),
    prisma.catalogLink.count({ where: { status: CatalogLinkStatus.ACTIVE } }),
    prisma.catalogLink.aggregate({ _sum: { viewCount: true } }),
    prisma.catalogInquiry.count(),
    prisma.catalogInquiry.count({ where: { status: 'NEW' } })
  ]);

  return {
    totalLinks,
    activeLinks,
    totalViews: totalViews._sum.viewCount || 0,
    totalInquiries,
    newInquiries
  };
}

export default async function CatalogLinksPage() {
  const [links, stats] = await Promise.all([getCatalogLinks(), getStats()]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalog Links</h1>
          <p className="text-gray-500 mt-1">
            Manage shareable product catalogs for retailers
          </p>
        </div>
        <Link
          href="/ops/catalog-links/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Catalog Link
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Links</p>
          <p className="text-2xl font-bold text-gray-900">{stats.totalLinks}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active Links</p>
          <p className="text-2xl font-bold text-green-600">{stats.activeLinks}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Views</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalViews}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Inquiries</p>
          <p className="text-2xl font-bold text-purple-600">{stats.totalInquiries}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">New Inquiries</p>
          <p className="text-2xl font-bold text-orange-600">{stats.newInquiries}</p>
        </div>
      </div>

      {/* Quick links */}
      <div className="mb-6">
        <Link
          href="/ops/catalog-links/inquiries"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
        >
          <MessageSquare className="w-4 h-4" />
          View All Inquiries
          {stats.newInquiries > 0 && (
            <span className="bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded-full">
              {stats.newInquiries} new
            </span>
          )}
        </Link>
      </div>

      {/* Links table */}
      <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
        <CatalogLinksClient links={links} />
      </Suspense>
    </div>
  );
}
