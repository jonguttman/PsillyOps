import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { formatDate, formatCurrency } from '@/lib/utils/formatters';
import StatusBadge, { MovementTypeBadge } from '@/components/ui/StatusBadge';
import TooltipWrapper, { TooltipIcon } from '@/components/ui/TooltipWrapper';
import { QRBehaviorPanelServer } from '@/components/qr/QRBehaviorPanelServer';
import { QRTokenInspector } from '@/components/qr/QRTokenInspector';
import InventoryAdjustClient from './InventoryAdjustClient';

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

const MOVEMENT_TYPE_COLORS: Record<string, string> = {
  ADJUST: 'bg-gray-100 text-gray-800',
  MOVE: 'bg-blue-100 text-blue-800',
  CONSUME: 'bg-red-100 text-red-800',
  PRODUCE: 'bg-green-100 text-green-800',
  RECEIVE: 'bg-purple-100 text-purple-800',
  RETURN: 'bg-orange-100 text-orange-800',
  RESERVE: 'bg-yellow-100 text-yellow-800',
  RELEASE: 'bg-teal-100 text-teal-800'
};

export default async function InventoryDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const { id } = await params;

  const [inventoryItem, movementsData] = await Promise.all([
    prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        material: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true, type: true } },
        batch: { 
          select: { 
            id: true, 
            batchCode: true, 
            status: true, 
            qcStatus: true,
            product: { select: { name: true } }
          } 
        }
      }
    }),
    prisma.inventoryMovement.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: 'desc' },
      take: 20
    })
  ]);

  if (!inventoryItem) {
    notFound();
  }

  const movements = movementsData || [];

  const itemName = inventoryItem.product?.name || inventoryItem.material?.name || 'Unknown';
  const itemSku = inventoryItem.product?.sku || inventoryItem.material?.sku || '';
  
  // Expiry status
  const getExpiryStatus = (expiryDate: Date | null) => {
    if (!expiryDate) return null;
    const now = new Date();
    const days = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { text: 'Expired', color: 'text-red-600 font-semibold', bgColor: 'bg-red-50' };
    if (days <= 30) return { text: `Expires in ${days} days`, color: 'text-orange-600', bgColor: 'bg-orange-50' };
    if (days <= 90) return { text: `Expires in ${days} days`, color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
    return { text: formatDate(expiryDate), color: 'text-gray-500', bgColor: 'bg-gray-50' };
  };

  const expiryStatus = getExpiryStatus(inventoryItem.expiryDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{itemName}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[inventoryItem.type]}`}>
              {inventoryItem.type}
            </span>
            <StatusBadge status={inventoryItem.status} userRole={session.user.role} />
          </div>
          {itemSku && (
            <p className="mt-1 text-sm text-gray-500">SKU: {itemSku}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/ops/inventory"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back to Inventory
          </Link>
        </div>
      </div>

      {/* Overview Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Overview</h2>
        <InventoryAdjustClient
          inventoryId={id}
          userRole={session.user.role}
          unitOfMeasure={inventoryItem.unitOfMeasure}
          initialOnHand={inventoryItem.quantityOnHand}
          initialReserved={inventoryItem.quantityReserved}
        />
        <div className="mt-6">
          <div className="text-sm text-gray-500">Unit Cost</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">
            {inventoryItem.unitCost ? formatCurrency(inventoryItem.unitCost) : '-'}
          </div>
        </div>
      </div>

      {/* Details Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Location</dt>
            <dd className="mt-1 text-sm text-gray-900">{inventoryItem.location.name}</dd>
          </div>
          {inventoryItem.batch && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Batch</dt>
              <dd className="mt-1">
                <Link 
                  href={`/ops/batches/${inventoryItem.batch.id}`}
                  className="text-sm text-blue-600 hover:text-blue-900"
                >
                  {inventoryItem.batch.batchCode}
                </Link>
              </dd>
            </div>
          )}
          {inventoryItem.lotNumber && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Lot Number</dt>
              <dd className="mt-1 text-sm text-gray-900">{inventoryItem.lotNumber}</dd>
            </div>
          )}
          {inventoryItem.expiryDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Expiry Date</dt>
              <dd className="mt-1">
                <span className={`text-sm ${expiryStatus?.color}`}>
                  {expiryStatus?.text}
                </span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Source</dt>
            <dd className="mt-1 text-sm text-gray-900">{inventoryItem.source || '-'}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(inventoryItem.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Expiry Warning */}
      {expiryStatus && expiryStatus.bgColor !== 'bg-gray-50' && (
        <div className={`${expiryStatus.bgColor} border-l-4 ${expiryStatus.color.replace('text-', 'border-')} p-4 rounded`}>
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className={`h-5 w-5 ${expiryStatus.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex items-center gap-2">
              <p className={`text-sm ${expiryStatus.color}`}>
                {expiryStatus.text.includes('Expired') 
                  ? 'This inventory item has expired and should not be used.'
                  : 'This inventory item is expiring soon. Use it before newer stock.'}
              </p>
              <TooltipWrapper tooltipId="inventory-expiry-warning" userRole={session.user.role} position="top">
                <TooltipIcon />
              </TooltipWrapper>
            </div>
          </div>
        </div>
      )}

      {/* Movement History */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Movement History</h2>
        {movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {movements.map((movement) => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(movement.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <MovementTypeBadge type={movement.type} userRole={session.user.role} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                      {movement.quantity > 0 ? '+' : ''}{movement.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {movement.fromLocation || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {movement.toLocation || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {movement.reason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No movement history</p>
        )}
      </div>

      {/* QR Behavior Panel - Only for product inventory */}
      {inventoryItem.type === 'PRODUCT' && (
        <>
          <QRBehaviorPanelServer
            entityType="INVENTORY"
            entityId={id}
            entityName={`${inventoryItem.product?.name || 'Unknown'} @ ${inventoryItem.location.name}`}
            isAdmin={session.user.role === 'ADMIN'}
          />
          <QRTokenInspector
            entityType="INVENTORY"
            entityId={id}
            isAdmin={session.user.role === 'ADMIN'}
            canView={['ADMIN', 'PRODUCTION', 'WAREHOUSE'].includes(session.user.role)}
          />
        </>
      )}

      {/* Related Links */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Related</h2>
        <div className="space-y-2">
          {inventoryItem.product && (
            <Link
              href={`/ops/products/${inventoryItem.product.id}`}
              className="block text-sm text-blue-600 hover:text-blue-900 hover:underline"
            >
              → View Product: {inventoryItem.product.name}
            </Link>
          )}
          {inventoryItem.material && (
            <Link
              href={`/ops/materials/${inventoryItem.material.id}`}
              className="block text-sm text-blue-600 hover:text-blue-900 hover:underline"
            >
              → View Material: {inventoryItem.material.name}
            </Link>
          )}
          {inventoryItem.batch && (
            <Link
              href={`/ops/batches/${inventoryItem.batch.id}`}
              className="block text-sm text-blue-600 hover:text-blue-900 hover:underline"
            >
              → View Batch: {inventoryItem.batch.batchCode}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
