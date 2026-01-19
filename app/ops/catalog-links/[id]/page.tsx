/**
 * Catalog Link Detail Page
 *
 * Shows detailed information and analytics for a catalog link.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import {
  buildCatalogUrl,
  getCatalogLinkAnalytics
} from '@/lib/services/catalogLinkService';
import {
  ArrowLeft,
  Eye,
  MessageSquare,
  Package,
  QrCode,
  Copy,
  ExternalLink,
  Calendar,
  Clock,
  User,
  FileText,
  Scan
} from 'lucide-react';
import { CatalogLinkDetailClient } from './CatalogLinkDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getCatalogLink(id: string) {
  const link = await prisma.catalogLink.findUnique({
    where: { id },
    include: {
      retailer: { select: { id: true, name: true, contactEmail: true } },
      createdBy: { select: { id: true, name: true } },
      productViews: {
        include: {
          product: { select: { id: true, name: true, sku: true } }
        },
        orderBy: { viewCount: 'desc' }
      },
      inquiries: {
        orderBy: { createdAt: 'desc' },
        take: 10
      },
      introSheets: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          createdBy: { select: { id: true, name: true } }
        }
      }
    }
  });

  if (!link) return null;

  return {
    ...link,
    catalogUrl: buildCatalogUrl(link.token)
  };
}

export default async function CatalogLinkDetailPage({ params }: PageProps) {
  const { id } = await params;

  const link = await getCatalogLink(id);

  if (!link) {
    notFound();
  }

  const analytics = await getCatalogLinkAnalytics(id);

  const statusBadge = {
    ACTIVE: 'bg-green-100 text-green-800',
    EXPIRED: 'bg-gray-100 text-gray-800',
    REVOKED: 'bg-red-100 text-red-800'
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Back link */}
      <Link
        href="/ops/catalog-links"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Catalog Links
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {link.displayName || link.retailer.name}
              </h1>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge[link.status]}`}>
                {link.status}
              </span>
            </div>
            {link.displayName && link.displayName !== link.retailer.name && (
              <p className="text-gray-500">Retailer: {link.retailer.name}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                Created by {link.createdBy.name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(link.createdAt).toLocaleDateString()}
              </span>
              {link.expiresAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Expires {new Date(link.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <CatalogLinkDetailClient
            catalogUrl={link.catalogUrl}
            token={link.token}
            status={link.status}
            linkId={link.id}
          />
        </div>

        {/* Link URL */}
        <div className="mt-4 bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Catalog URL</p>
          <code className="text-sm break-all">{link.catalogUrl}</code>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Total Views</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.totalViews}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Days Viewed</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.uniqueDaysViewed}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Package className="w-4 h-4" />
            <span className="text-sm">Product Views</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.totalProductViews}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm">Inquiries</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{analytics.totalInquiries}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Top Viewed Products</h2>
          {link.productViews.length > 0 ? (
            <div className="space-y-3">
              {link.productViews.slice(0, 10).map(view => (
                <div key={view.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{view.product.name}</p>
                    <p className="text-xs text-gray-500">{view.product.sku}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-600">{view.viewCount}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No product views yet</p>
          )}
        </div>

        {/* Recent Inquiries */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Recent Inquiries</h2>
          {link.inquiries.length > 0 ? (
            <div className="space-y-3">
              {link.inquiries.map(inquiry => (
                <div key={inquiry.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-gray-900">{inquiry.contactName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inquiry.status === 'NEW' ? 'bg-orange-100 text-orange-800' :
                      inquiry.status === 'CONTACTED' ? 'bg-blue-100 text-blue-800' :
                      inquiry.status === 'CONVERTED' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {inquiry.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{inquiry.businessName}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(inquiry.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No inquiries yet</p>
          )}
        </div>
      </div>

      {/* Intro Sheet Tracking */}
      {link.introSheets.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Intro Sheet Activity
          </h2>
          <div className="space-y-4">
            {link.introSheets.map(sheet => (
              <div key={sheet.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Generated by {sheet.createdBy.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(sheet.createdAt).toLocaleDateString()} at {new Date(sheet.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {sheet.firstScannedAt ? (
                    <>
                      <div className="text-right">
                        <p className="text-sm font-medium text-green-600 flex items-center gap-1">
                          <Scan className="w-4 h-4" />
                          {sheet.scanCount} {sheet.scanCount === 1 ? 'scan' : 'scans'}
                        </p>
                        <p className="text-xs text-gray-500">
                          First scan: {new Date(sheet.firstScannedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">Not scanned yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
        <h2 className="font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {analytics.recentActivity.length > 0 ? (
          <div className="space-y-2">
            {analytics.recentActivity.slice(0, 15).map((activity, index) => (
              <div key={index} className="flex items-center gap-3 text-sm">
                <span className="text-gray-400 w-32 flex-shrink-0">
                  {new Date(activity.date).toLocaleString()}
                </span>
                <span className="text-gray-600">{activity.details}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No activity yet</p>
        )}
      </div>
    </div>
  );
}
