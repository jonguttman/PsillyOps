import Link from 'next/link';
import { AlertTriangle, Package, Clock, CheckCircle, SlidersHorizontal } from 'lucide-react';

interface SupplyWatchCardProps {
  lowStockMaterials: Array<{
    id: string;
    name: string;
    currentStockQty: number;
    reorderPoint: number;
  }>;
  recentManualAdjustments: Array<{
    id: string;
    createdAt: Date;
    deltaQty: number;
    reason: string;
    inventory: {
      id: string;
      type: 'PRODUCT' | 'MATERIAL';
      product?: { id: string; name: string } | null;
      material?: { id: string; name: string } | null;
    };
  }>;
  openPOsCount: number;
  daysSinceLastReceipt: number | null;
}

export default function SupplyWatchCard({
  lowStockMaterials,
  recentManualAdjustments,
  openPOsCount,
  daysSinceLastReceipt,
}: SupplyWatchCardProps) {
  const materialsNeedingReorder = lowStockMaterials.length;
  const hasIssues = materialsNeedingReorder > 0;
  const hasOpenPOs = openPOsCount > 0;
  const hasManualAdjustments = recentManualAdjustments.length > 0;
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Supply Watch</h2>
      
      <div className="space-y-3">
        {/* Materials needing reorder */}
        <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-500" />
            )}
            <span className="text-sm text-gray-700">
              {hasIssues ? (
                <>
                  <strong>{materialsNeedingReorder}</strong> material
                  {materialsNeedingReorder !== 1 ? 's' : ''} below reorder point
                </>
              ) : (
                'All materials above reorder points'
              )}
            </span>
          </div>
          {hasIssues ? (
            <Link
              href="/ops/materials"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View
            </Link>
          ) : null}
        </div>

        {/* Recent manual adjustments */}
        <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className={`w-4 h-4 ${hasManualAdjustments ? 'text-amber-500' : 'text-gray-400'}`} />
            <span className="text-sm text-gray-700">
              {hasManualAdjustments ? (
                <>
                  <strong>{recentManualAdjustments.length}</strong> manual adjustment
                  {recentManualAdjustments.length !== 1 ? 's' : ''} (last 48h)
                </>
              ) : (
                'No manual adjustments in last 48h'
              )}
            </span>
          </div>
        </div>

        {/* Open POs */}
        <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-700">
              {hasOpenPOs ? (
                <>
                  <strong>{openPOsCount}</strong> open purchase order
                  {openPOsCount !== 1 ? 's' : ''}
                </>
              ) : (
                'No open purchase orders'
              )}
            </span>
          </div>
          <Link
            href="/ops/purchase-orders"
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            {hasOpenPOs ? 'View' : 'Create'}
          </Link>
        </div>

        {/* Last receipt */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700">
              {daysSinceLastReceipt === null ? (
                'No POs received yet'
              ) : daysSinceLastReceipt === 0 ? (
                'Last PO received today'
              ) : daysSinceLastReceipt === 1 ? (
                'Last PO received yesterday'
              ) : (
                <>
                  Last PO received <strong>{daysSinceLastReceipt}</strong> days ago
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Deep links */}
      {(hasIssues || hasManualAdjustments) && (
        <div className="mt-4 space-y-2">
          {hasIssues && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Below reorder point</div>
              <ul className="space-y-1">
                {lowStockMaterials.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <Link href={`/materials/${m.id}`} className="text-xs text-blue-700 hover:underline truncate">
                      {m.name}
                    </Link>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {m.currentStockQty} / {m.reorderPoint}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasManualAdjustments && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Recent adjustments</div>
              <ul className="space-y-1">
                {recentManualAdjustments.slice(0, 5).map((a) => {
                  const name =
                    a.inventory.product?.name ||
                    a.inventory.material?.name ||
                    (a.inventory.type === 'MATERIAL' ? 'Material inventory' : 'Product inventory');
                  const sign = a.deltaQty > 0 ? '+' : '';
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <Link href={`/inventory/${a.inventory.id}`} className="text-xs text-blue-700 hover:underline truncate">
                        {name}
                      </Link>
                      <span className="text-xs text-gray-500 flex-shrink-0" title={a.reason}>
                        {sign}{a.deltaQty}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

