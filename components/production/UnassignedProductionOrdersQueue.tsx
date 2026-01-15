'use client';

import Link from 'next/link';
import { CalendarIcon, AlertCircleIcon } from 'lucide-react';

interface UnassignedOrder {
  id: string;
  orderNumber: string;
  quantityToMake: number;
  scheduledDate: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
  };
}

interface UnassignedProductionOrdersQueueProps {
  orders: UnassignedOrder[];
  userRole: string;
}

export function UnassignedProductionOrdersQueue({ 
  orders, 
  userRole 
}: UnassignedProductionOrdersQueueProps) {
  // Only show to admins and production roles
  if (!['ADMIN', 'PRODUCTION'].includes(userRole)) {
    return null;
  }

  if (orders.length === 0) {
    return null;
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const isOverdue = (scheduledDate: string | null) => {
    if (!scheduledDate) return false;
    return new Date(scheduledDate) < new Date();
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertCircleIcon className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-900">
            Unassigned Production Orders ({orders.length})
          </h3>
        </div>
        <Link 
          href="/ops/production?filter=unassigned"
          className="text-xs text-amber-700 hover:text-amber-900"
        >
          View All
        </Link>
      </div>

      <div className="space-y-2">
        {orders.slice(0, 5).map((order) => {
          const overdue = isOverdue(order.scheduledDate);
          return (
            <div 
              key={order.id}
              className={`flex items-center justify-between p-3 bg-white rounded-lg border ${
                overdue ? 'border-red-200' : 'border-amber-100'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {order.orderNumber}
                  </span>
                  {overdue && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                      Overdue
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {order.product.name} ({order.product.sku}) • {order.quantityToMake} units
                </div>
                {order.scheduledDate && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                    <CalendarIcon className="h-3 w-3" />
                    Scheduled: {formatDate(order.scheduledDate)}
                  </div>
                )}
              </div>
              <Link
                href={`/ops/production/${order.id}`}
                className="ml-3 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded hover:bg-amber-200"
              >
                Assign & Start
              </Link>
            </div>
          );
        })}
      </div>

      {orders.length > 5 && (
        <div className="mt-3 text-center">
          <Link 
            href="/ops/production?filter=unassigned"
            className="text-xs text-amber-700 hover:text-amber-900"
          >
            +{orders.length - 5} more unassigned orders
          </Link>
        </div>
      )}
    </div>
  );
}

