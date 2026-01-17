/**
 * Catalog Inquiries Page
 *
 * Lists all inquiries across all catalog links.
 */

import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { ArrowLeft, Mail, Phone, Building2, User } from 'lucide-react';
import { InquiriesClient } from './InquiriesClient';

async function getInquiries() {
  return prisma.catalogInquiry.findMany({
    include: {
      catalogLink: {
        include: {
          retailer: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

async function getStats() {
  const [total, newCount, contacted, converted] = await Promise.all([
    prisma.catalogInquiry.count(),
    prisma.catalogInquiry.count({ where: { status: 'NEW' } }),
    prisma.catalogInquiry.count({ where: { status: 'CONTACTED' } }),
    prisma.catalogInquiry.count({ where: { status: 'CONVERTED' } })
  ]);

  return { total, newCount, contacted, converted };
}

export default async function InquiriesPage() {
  const [inquiries, stats] = await Promise.all([getInquiries(), getStats()]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back link */}
      <Link
        href="/ops/catalog-links"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Catalog Links
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Catalog Inquiries</h1>
        <p className="text-gray-500 mt-1">
          Manage inquiries from catalog contact forms
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Inquiries</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">New</p>
          <p className="text-2xl font-bold text-orange-600">{stats.newCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Contacted</p>
          <p className="text-2xl font-bold text-blue-600">{stats.contacted}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Converted</p>
          <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
        </div>
      </div>

      {/* Inquiries list */}
      <InquiriesClient inquiries={inquiries} />
    </div>
  );
}
