import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { adjustInventory, moveInventory } from '@/lib/services/inventoryService';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  RESERVED: 'bg-yellow-100 text-yellow-800',
  QUARANTINED: 'bg-orange-100 text-orange-800',
  DAMAGED: 'bg-red-100 text-red-800',
  SCRAPPED: 'bg-gray-100 text-gray-800'
};

const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  ADJUST: 'bg-yellow-100 text-yellow-800',
  MOVE: 'bg-blue-100 text-blue-800',
  CONSUME: 'bg-red-100 text-red-800',
  PRODUCE: 'bg-green-100 text-green-800',
  RECEIVE: 'bg-purple-100 text-purple-800',
  RETURN: 'bg-orange-100 text-orange-800',
  RESERVE: 'bg-indigo-100 text-indigo-800',
  RELEASE: 'bg-teal-100 text-teal-800'
};

async function handleAdjust(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const inventoryId = formData.get('inventoryId') as string;
  const deltaQuantity = parseFloat(formData.get('deltaQuantity') as string);
  const reason = formData.get('reason') as string;

  await adjustInventory({
    inventoryId,
    deltaQuantity,
    reason,
    userId: session.user.id
  });

  revalidatePath(`/inventory/${inventoryId}`);
}

async function handleMove(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const inventoryId = formData.get('inventoryId') as string;
  const toLocationId = formData.get('toLocationId') as string;
  const quantity = parseFloat(formData.get('quantity') as string);
  const reason = formData.get('reason') as string;

  await moveInventory({
    inventoryId,
    toLocationId,
    quantity,
    reason,
    userId: session.user.id
  });

  revalidatePath(`/inventory/${inventoryId}`);
  revalidatePath('/inventory');
}

export default async function InventoryDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const { id } = await params;
  const { action } = await searchParams;

  const [inventory, , locations] = await Promise.all([
    prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        product: true,
        material: true,
        location: true,
        batch: {
          include: { product: true }
        }
      }
    }),
    prisma.inventoryMovement.findMany({
      where: {
        OR: [
          { inventoryId: id },
          { batchId: { not: null } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    }).then(moves => moves.filter(m => m.inventoryId === id || (inventory?.batchId && m.batchId === inventory.batchId))),
    prisma.location.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    })
  ]);

  if (!inventory) notFound();

  // Re-fetch movements with correct filter after inventory is loaded
  const filteredMovements = await prisma.inventoryMovement.findMany({
    where: {
      OR: [
        { inventoryId: id },
        ...(inventory.batchId ? [{ batchId: inventory.batchId }] : []),
        ...(inventory.materialId ? [{ materialId: inventory.materialId }] : []),
        ...(inventory.productId ? [{ productId: inventory.productId }] : [])
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const itemName = inventory.product?.name || inventory.material?.name || 'Unknown';
  const itemSku = inventory.product?.sku || inventory.material?.sku || '';
  const available = inventory.quantityOnHand - inventory.quantityReserved;

  const canAdjust = session.user.role === 'ADMIN' || session.user.role === 'WAREHOUSE';
  const canMove = session.user.role !== 'REP';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{itemName}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {itemSku}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inventory.status]}`}>
              {inventory.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {inventory.type} at {inventory.location.name}
          </p>
        </div>
        <div className="flex gap-2">
          {canMove && (
            <Link
              href={`/inventory/${id}?action=move`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Move Stock
            </Link>
          )}
          {canAdjust && (
            <Link
              href={`/inventory/${id}?action=adjust`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Adjust Stock
            </Link>
          )}
          <Link
            href="/inventory"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back
          </Link>
        </div>
      </div>

      {/* Action Forms */}
      {action === 'adjust' && canAdjust && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Adjust Stock</h3>
          <form action={handleAdjust} className="space-y-4">
            <input type="hidden" name="inventoryId" value={id} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity Change (+/-)</label>
                <input
                  type="number"
                  name="deltaQuantity"
                  step="0.01"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., -5 or +10"
                />
                <p className="mt-1 text-xs text-gray-500">Current: {inventory.quantityOnHand} {inventory.unitOfMeasure}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reason</label>
                <input
                  type="text"
                  name="reason"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., Cycle count correction"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700"
              >
                Apply Adjustment
              </button>
              <Link
                href={`/inventory/${id}`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}

      {action === 'move' && canMove && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Move Stock</h3>
          <form action={handleMove} className="space-y-4">
            <input type="hidden" name="inventoryId" value={id} />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Quantity to Move</label>
                <input
                  type="number"
                  name="quantity"
                  step="0.01"
                  min="0.01"
                  max={available}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Available: {available} {inventory.unitOfMeasure}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">To Location</label>
                <select
                  name="toLocationId"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Select location...</option>
                  {locations.filter(l => l.id !== inventory.locationId).map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reason (optional)</label>
                <input
                  type="text"
                  name="reason"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., Relocating to staging"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Move Stock
              </button>
              <Link
                href={`/inventory/${id}`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* Overview Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Inventory Details</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">On Hand</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              {inventory.quantityOnHand.toLocaleString()}
              <span className="text-sm font-normal text-gray-500 ml-1">{inventory.unitOfMeasure}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Reserved</dt>
            <dd className="mt-1 text-2xl font-semibold text-yellow-600">
              {inventory.quantityReserved.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Available</dt>
            <dd className="mt-1 text-2xl font-semibold text-green-600">
              {available.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Location</dt>
            <dd className="mt-1 text-sm text-gray-900">{inventory.location.name}</dd>
          </div>
          {inventory.lotNumber && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Lot Number</dt>
              <dd className="mt-1 text-sm text-gray-900">{inventory.lotNumber}</dd>
            </div>
          )}
          {inventory.expiryDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Expiry Date</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(inventory.expiryDate)}</dd>
            </div>
          )}
          {inventory.unitCost && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Unit Cost</dt>
              <dd className="mt-1 text-sm text-gray-900">${inventory.unitCost.toFixed(2)}</dd>
            </div>
          )}
          {inventory.batch && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Batch</dt>
              <dd className="mt-1">
                <Link href={`/batches/${inventory.batch.id}`} className="text-sm text-blue-600 hover:text-blue-900">
                  {inventory.batch.batchCode}
                </Link>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Source</dt>
            <dd className="mt-1 text-sm text-gray-900">{inventory.source}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(inventory.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Movement History */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Movement History</h2>
        {filteredMovements.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Type</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Quantity</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">From</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">To</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMovements.map(movement => (
                <tr key={movement.id}>
                  <td className="py-2 text-sm text-gray-500">{formatDateTime(movement.createdAt)}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${MOVEMENT_TYPE_COLORS[movement.type]}`}>
                      {movement.type}
                    </span>
                  </td>
                  <td className="py-2 text-sm text-right font-medium text-gray-900">
                    {movement.quantity > 0 ? '+' : ''}{movement.quantity.toLocaleString()}
                  </td>
                  <td className="py-2 text-sm text-gray-500">{movement.fromLocation || '-'}</td>
                  <td className="py-2 text-sm text-gray-500">{movement.toLocation || '-'}</td>
                  <td className="py-2 text-sm text-gray-500">{movement.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No movement history</p>
        )}
      </div>
    </div>
  );
}
