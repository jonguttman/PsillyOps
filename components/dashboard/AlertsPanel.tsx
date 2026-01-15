import Link from 'next/link';
import BlockedOrderAlertActions from './BlockedOrderAlertActions';

interface LowStockMaterial {
  id: string;
  name: string;
  currentStockQty: number;
  reorderPoint: number;
}

interface BlockedOrder {
  id: string;
  orderNumber: string;
  product: { name: string };
}

interface QcHoldBatch {
  id: string;
  batchCode: string;
  product: { name: string };
}

interface OrderWithShortage {
  id: string;
  orderNumber: string;
  retailer: { name: string };
}

interface OrderAwaitingInvoice {
  id: string;
  orderNumber: string;
  retailer: { name: string };
}

interface AlertsPanelProps {
  lowStockMaterials: LowStockMaterial[];
  blockedOrders: BlockedOrder[];
  qcHoldBatches: QcHoldBatch[];
  ordersWithShortages: OrderWithShortage[];
  ordersAwaitingInvoice: OrderAwaitingInvoice[];
}

export default function AlertsPanel({
  lowStockMaterials,
  blockedOrders,
  qcHoldBatches,
  ordersWithShortages,
  ordersAwaitingInvoice,
}: AlertsPanelProps) {
  const hasAlerts =
    lowStockMaterials.length > 0 ||
    blockedOrders.length > 0 ||
    qcHoldBatches.length > 0 ||
    ordersWithShortages.length > 0 ||
    ordersAwaitingInvoice.length > 0;

  if (!hasAlerts) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Alerts</h2>
        <p className="text-sm text-gray-500">No issues requiring attention</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Alerts</h2>
      <ul className="space-y-2">
        {/* Low Stock Materials */}
        {lowStockMaterials.length > 0 && (
          <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <strong>{lowStockMaterials.length}</strong> material{lowStockMaterials.length !== 1 ? 's' : ''} below reorder point
              </span>
            </div>
            <Link
              href="/ops/materials"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View
            </Link>
          </li>
        )}

        {/* Blocked Production Orders - with inline actions */}
        {blockedOrders.length > 0 && (
          <BlockedOrderAlertActions blockedOrders={blockedOrders} />
        )}

        {/* QC Hold Batches */}
        {qcHoldBatches.length > 0 && (
          <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <strong>{qcHoldBatches.length}</strong> batch{qcHoldBatches.length !== 1 ? 'es' : ''} in QC hold
              </span>
            </div>
            <Link
              href="/ops/batches"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View
            </Link>
          </li>
        )}

        {/* Orders with Shortages */}
        {ordersWithShortages.length > 0 && (
          <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <strong>{ordersWithShortages.length}</strong> order{ordersWithShortages.length !== 1 ? 's' : ''} with shortages
              </span>
            </div>
            <Link
              href="/ops/orders"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View
            </Link>
          </li>
        )}

        {/* Orders Awaiting Invoice */}
        {ordersAwaitingInvoice.length > 0 && (
          <li className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
              <span className="text-sm text-gray-700">
                <strong>{ordersAwaitingInvoice.length}</strong> order{ordersAwaitingInvoice.length !== 1 ? 's' : ''} awaiting invoice
              </span>
            </div>
            <Link
              href="/ops/orders"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              View
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

