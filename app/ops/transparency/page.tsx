/**
 * Transparency Records List
 * 
 * Admin page to view and manage all transparency records.
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { Shield, Plus, FlaskConical, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';

export default async function TransparencyRecordsPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  // Only admins can view transparency records
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch all transparency records with entity details
  const records = await prisma.transparencyRecord.findMany({
    orderBy: { createdAt: 'desc' },
    include: { lab: true },
  });

  // Fetch entity names for display
  const productIds = records
    .filter(r => r.entityType === 'PRODUCT')
    .map(r => r.entityId);
  const batchIds = records
    .filter(r => r.entityType === 'BATCH')
    .map(r => r.entityId);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  });

  const batches = await prisma.batch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, batchCode: true, product: { select: { name: true } } },
  });

  const productMap = new Map(products.map(p => [p.id, p]));
  const batchMap = new Map(batches.map(b => [b.id, b]));

  function getEntityName(entityType: string, entityId: string) {
    if (entityType === 'PRODUCT') {
      const product = productMap.get(entityId);
      return product ? `${product.name} (${product.sku})` : entityId;
    }
    if (entityType === 'BATCH') {
      const batch = batchMap.get(entityId);
      return batch ? `${batch.product.name} - ${batch.batchCode}` : entityId;
    }
    return entityId;
  }

  function getResultBadge(result: string | null) {
    switch (result) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            PASS
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3" />
            PENDING
          </span>
        );
      case 'FAIL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3" />
            FAIL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Not Set
          </span>
        );
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transparency Records</h1>
            <p className="text-sm text-gray-500">
              Manage product and batch transparency information
            </p>
          </div>
        </div>
        <Link
          href="/ops/transparency/records/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Record
        </Link>
      </div>

      {/* Quick Links */}
      <div className="flex gap-4 mb-6">
        <Link
          href="/ops/transparency/labs"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FlaskConical className="w-4 h-4 text-purple-600" />
          Manage Labs
        </Link>
        <Link
          href="/ops/transparency/copy"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FileText className="w-4 h-4 text-green-600" />
          Edit Public Copy
        </Link>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {records.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No transparency records yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create your first transparency record to get started.
            </p>
            <Link
              href="/ops/transparency/records/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Record
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Test Result
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lab
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Test Date
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
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {getEntityName(record.entityType, record.entityId)}
                    </div>
                    {record.batchCode && (
                      <div className="text-xs text-gray-500">
                        Batch: {record.batchCode}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {record.entityType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getResultBadge(record.testResult)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.labNameSnapshot || record.lab?.name || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {record.testDate
                      ? new Date(record.testDate).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link
                      href={`/ops/transparency/records/${record.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
