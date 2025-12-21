import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/formatters';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  RESERVED: 'bg-yellow-100 text-yellow-800',
  QUARANTINED: 'bg-orange-100 text-orange-800',
  DAMAGED: 'bg-red-100 text-red-800',
  SCRAPPED: 'bg-gray-100 text-gray-800'
};

const TYPE_COLORS: Record<string, string> = {
  PRODUCT: 'bg-blue-100 text-blue-800',
  MATERIAL: 'bg-purple-100 text-purple-800'
};

export default async function InventoryPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; locationId?: string; status?: string; search?: string }>
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const params = await searchParams;

  // Build filter
  const where: any = {};
  if (params.type) where.type = params.type;
  if (params.locationId) where.locationId = params.locationId;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { product: { name: { contains: params.search } } },
      { material: { name: { contains: params.search } } },
      { lotNumber: { contains: params.search } }
    ];
  }

  const [inventory, locations] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
        material: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true, type: true } },
        batch: { select: { id: true, batchCode: true, status: true, qcStatus: true } }
      },
      orderBy: [
        { expiryDate: 'asc' },
        { createdAt: 'desc' }
      ],
      take: 100
    }),
    prisma.location.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    })
  ]);

  // Calculate days until expiry
  const now = new Date();
  const getExpiryStatus = (expiryDate: Date | null) => {
    if (!expiryDate) return null;
    const days = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { text: 'Expired', color: 'text-red-600 font-semibold' };
    if (days <= 30) return { text: `${days}d`, color: 'text-orange-600' };
    if (days <= 90) return { text: `${days}d`, color: 'text-yellow-600' };
    return { text: formatDate(expiryDate), color: 'text-gray-500' };
  };

  const userRole = session.user.role;
  const canAddInitial = userRole === 'ADMIN' || userRole === 'WAREHOUSE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-1 text-sm text-gray-600">
            View and manage stock across all locations
          </p>
        </div>
        {canAddInitial && (
          <Link
            href="/ops/inventory/initial-setup"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
          >
            Add Initial Inventory
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <form method="GET" className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              name="search"
              defaultValue={params.search}
              placeholder="Search items..."
              className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              name="type"
              defaultValue={params.type}
              className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All</option>
              <option value="PRODUCT">Product</option>
              <option value="MATERIAL">Material</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select
              name="locationId"
              defaultValue={params.locationId}
              className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Locations</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              name="status"
              defaultValue={params.status}
              className="block w-36 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="QUARANTINED">Quarantined</option>
              <option value="DAMAGED">Damaged</option>
              <option value="SCRAPPED">Scrapped</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Filter
          </button>
          {(params.search || params.type || params.locationId || params.status) && (
            <Link
              href="/ops/inventory"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Inventory Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Item
              </th>
              <th className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-2 md:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Qty
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reserved
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Available
              </th>
              <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Batch/Lot
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiry
              </th>
              <th className="px-2 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {inventory.map((item) => {
              const itemName = item.product?.name || item.material?.name || 'Unknown';
              const itemSku = item.product?.sku || item.material?.sku || '';
              const available = item.quantityOnHand - item.quantityReserved;
              const expiryStatus = getExpiryStatus(item.expiryDate);

              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <Link href={`/ops/inventory/${item.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                      <div className="text-sm font-medium text-gray-900 hover:text-blue-600">{itemName}</div>
                      <div className="text-xs text-gray-500">{itemSku}</div>
                    </Link>
                  </td>
                  <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[item.type]}`}>
                      {item.type.slice(0, 4)}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.location.name}
                  </td>
                  <td className="px-2 md:px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                    {item.quantityOnHand.toLocaleString()}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                    {item.quantityReserved > 0 ? item.quantityReserved.toLocaleString() : '-'}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                    {available.toLocaleString()}
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
                    {item.batch ? (
                      <Link href={`/ops/batches/${item.batch.id}`} className="text-sm text-blue-600 hover:text-blue-900">
                        {item.batch.batchCode}
                      </Link>
                    ) : item.lotNumber ? (
                      <span className="text-sm text-gray-900">{item.lotNumber}</span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
                    {expiryStatus ? (
                      <span className={`text-sm ${expiryStatus.color}`}>{expiryStatus.text}</span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-2 md:px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                      {item.status.slice(0, 5)}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/ops/inventory/${item.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {inventory.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 md:px-6 py-12 text-center text-sm text-gray-500">
                  No inventory items found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
