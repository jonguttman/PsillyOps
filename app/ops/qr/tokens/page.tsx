import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils/formatters';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  REVOKED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-800'
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  PRODUCT: 'bg-blue-100 text-blue-800',
  BATCH: 'bg-purple-100 text-purple-800',
  INVENTORY: 'bg-orange-100 text-orange-800',
  CUSTOM: 'bg-gray-100 text-gray-800'
};

interface SearchParams {
  status?: string;
  entityType?: string;
  search?: string;
  page?: string;
}

export default async function TokenManagerPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/ops/dashboard');

  const params = await searchParams;
  const statusFilter = params.status || 'all';
  const entityTypeFilter = params.entityType || 'all';
  const searchQuery = params.search || '';
  const page = parseInt(params.page || '1', 10);
  const pageSize = 50;

  // Build where clause
  const whereClause: Record<string, unknown> = {};

  if (statusFilter !== 'all') {
    whereClause.status = statusFilter;
  }

  if (entityTypeFilter !== 'all') {
    whereClause.entityType = entityTypeFilter;
  }

  if (searchQuery) {
    whereClause.OR = [
      { token: { contains: searchQuery, mode: 'insensitive' } },
      { entityId: { contains: searchQuery, mode: 'insensitive' } }
    ];
  }

  // Get tokens with pagination
  const [tokens, total, products, batches] = await Promise.all([
    prisma.qRToken.findMany({
      where: whereClause,
      orderBy: { printedAt: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize
    }),
    prisma.qRToken.count({ where: whereClause }),
    prisma.product.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    }),
    prisma.batch.findMany({
      select: { id: true, batchCode: true, productId: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
  ]);

  // Create lookup maps for entity names
  const productMap = new Map(products.map(p => [p.id, p.name]));
  const batchMap = new Map(batches.map(b => [b.id, b.batchCode]));

  // Enrich tokens with entity names
  const enrichedTokens = tokens.map(token => ({
    ...token,
    entityName: token.entityType === 'PRODUCT'
      ? productMap.get(token.entityId) || token.entityId
      : token.entityType === 'BATCH'
        ? batchMap.get(token.entityId) || token.entityId
        : token.entityId
  }));

  const totalPages = Math.ceil(total / pageSize);

  // Get stats
  const stats = await prisma.qRToken.groupBy({
    by: ['status'],
    _count: true
  });

  const statsMap = new Map(stats.map(s => [s.status, s._count]));
  const activeCount = statsMap.get('ACTIVE') || 0;
  const revokedCount = statsMap.get('REVOKED') || 0;
  const expiredCount = statsMap.get('EXPIRED') || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR Token Manager</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage and track QR tokens across products and batches
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <dt className="text-sm font-medium text-gray-500">Total Tokens</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-900">{total.toLocaleString()}</dd>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <dt className="text-sm font-medium text-gray-500">Active</dt>
          <dd className="mt-1 text-2xl font-semibold text-green-600">{activeCount.toLocaleString()}</dd>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <dt className="text-sm font-medium text-gray-500">Revoked</dt>
          <dd className="mt-1 text-2xl font-semibold text-red-600">{revokedCount.toLocaleString()}</dd>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <dt className="text-sm font-medium text-gray-500">Expired</dt>
          <dd className="mt-1 text-2xl font-semibold text-gray-600">{expiredCount.toLocaleString()}</dd>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <form method="GET" className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="REVOKED">Revoked</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              name="entityType"
              defaultValue={entityTypeFilter}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            >
              <option value="all">All Types</option>
              <option value="PRODUCT">Product</option>
              <option value="BATCH">Batch</option>
              <option value="INVENTORY">Inventory</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={searchQuery}
              placeholder="Search by token or entity ID..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            Filter
          </button>

          {(statusFilter !== 'all' || entityTypeFilter !== 'all' || searchQuery) && (
            <Link
              href="/ops/qr/tokens"
              className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Token Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Token
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Printed
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scans
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {enrichedTokens.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No tokens found
                </td>
              </tr>
            ) : (
              enrichedTokens.map((token) => (
                <tr key={token.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-mono text-sm text-gray-900">
                      {token.token.slice(0, 7)}...{token.token.slice(-4)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[token.status]}`}>
                      {token.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ENTITY_TYPE_COLORS[token.entityType]}`}>
                      {token.entityType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {token.entityType === 'PRODUCT' ? (
                      <Link
                        href={`/ops/products/${token.entityId}`}
                        className="text-sm text-blue-600 hover:text-blue-900"
                      >
                        {token.entityName}
                      </Link>
                    ) : token.entityType === 'BATCH' ? (
                      <Link
                        href={`/ops/batches/${token.entityId}`}
                        className="text-sm text-blue-600 hover:text-blue-900"
                      >
                        {token.entityName}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {token.entityName}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(token.printedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {token.scanCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    {token.entityType === 'PRODUCT' && token.status === 'ACTIVE' && (
                      <span className="text-xs text-gray-400">
                        Associable
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t">
            <p className="text-sm text-gray-700">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} tokens
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/ops/qr/tokens?page=${page - 1}&status=${statusFilter}&entityType=${entityTypeFilter}&search=${searchQuery}`}
                  className="px-3 py-1 text-sm bg-white border rounded-md hover:bg-gray-50"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/ops/qr/tokens?page=${page + 1}&status=${statusFilter}&entityType=${entityTypeFilter}&search=${searchQuery}`}
                  className="px-3 py-1 text-sm bg-white border rounded-md hover:bg-gray-50"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">About QR Tokens</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>PRODUCT tokens</strong> can be associated with specific batches for traceability</li>
          <li>• <strong>BATCH tokens</strong> are already linked to a specific production batch</li>
          <li>• To associate a token, go to the batch detail page and use &quot;Associate QR Token&quot;</li>
          <li>• Tokens track scan counts and last scan time for analytics</li>
        </ul>
      </div>
    </div>
  );
}
