import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { formatDate } from '@/lib/utils/formatters';
import { ProductionStatus } from '@prisma/client';

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 border-gray-300',
  IN_PROGRESS: 'bg-blue-50 border-blue-300',
  BLOCKED: 'bg-red-50 border-red-300',
  COMPLETED: 'bg-green-50 border-green-300',
  CANCELLED: 'bg-gray-100 border-gray-200 opacity-50'
};

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};


export default async function ProductionPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const orders = await prisma.productionOrder.findMany({
    where: {
      status: { not: ProductionStatus.CANCELLED }
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      workCenter: { select: { id: true, name: true } },
      batches: {
        select: {
          id: true,
          batchCode: true,
          status: true,
          qcStatus: true,
          actualQuantity: true
        }
      },
      materials: {
        select: {
          shortage: true
        }
      },
      _count: {
        select: { batches: true }
      }
    },
    orderBy: [
      { scheduledDate: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  // Group orders by status for Kanban
  const columns: Record<string, typeof orders> = {
    PLANNED: [],
    IN_PROGRESS: [],
    BLOCKED: [],
    COMPLETED: []
  };

  orders.forEach(order => {
    if (columns[order.status]) {
      columns[order.status].push(order);
    }
  });

  // Calculate stats
  const totalOrders = orders.length;
  const inProgressCount = columns.IN_PROGRESS.length;
  const blockedCount = columns.BLOCKED.length;
  const completedThisWeek = columns.COMPLETED.filter(o => {
    const completed = o.completedAt;
    if (!completed) return false;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return new Date(completed) >= weekAgo;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage production orders and track progress
          </p>
        </div>
        <Link
          href="/ops/production/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          New Production Order
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Total Orders</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{totalOrders}</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4 border border-blue-200">
          <div className="text-sm font-medium text-blue-700">In Progress</div>
          <div className="mt-1 text-2xl font-semibold text-blue-900">{inProgressCount}</div>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 border border-red-200">
          <div className="text-sm font-medium text-red-700">Blocked</div>
          <div className="mt-1 text-2xl font-semibold text-red-900">{blockedCount}</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 border border-green-200">
          <div className="text-sm font-medium text-green-700">Completed (7d)</div>
          <div className="mt-1 text-2xl font-semibold text-green-900">{completedThisWeek}</div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-4 gap-4">
        {(['PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as const).map(status => (
          <div key={status} className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">{STATUS_LABELS[status]}</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                {columns[status].length}
              </span>
            </div>
            <div className="space-y-3">
              {columns[status].map(order => {
                const hasShortage = order.materials.some(m => m.shortage > 0);
                const hasQCPending = order.batches.some(b => 
                  b.qcStatus === 'PENDING' || b.qcStatus === 'HOLD'
                );
                const totalProduced = order.batches.reduce(
                  (sum, b) => sum + (b.actualQuantity || 0), 0
                );
                const progress = order.quantityToMake > 0 
                  ? Math.round((totalProduced / order.quantityToMake) * 100)
                  : 0;

                return (
                  <Link
                    key={order.id}
                    href={`/production/${order.id}`}
                    className={`block bg-white rounded-lg border-2 p-4 hover:shadow-md transition-shadow ${STATUS_COLORS[status]}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {order.product.name}
                      </div>
                      {order.workCenter && (
                        <span className="ml-2 text-xs text-gray-500 shrink-0">
                          {order.workCenter.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {order.orderNumber}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-gray-600">
                        {totalProduced} / {order.quantityToMake}
                      </span>
                      {status !== 'COMPLETED' && (
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-blue-600 h-1.5 rounded-full" 
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {order.scheduledDate && (
                      <div className="mt-2 text-xs text-gray-500">
                        Scheduled: {formatDate(order.scheduledDate)}
                      </div>
                    )}
                    {/* Status Tags */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {hasShortage && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          Shortage
                        </span>
                      )}
                      {hasQCPending && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                          QC Pending
                        </span>
                      )}
                      {order._count.batches > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {order._count.batches} batch{order._count.batches !== 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
              {columns[status].length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">
                  No orders
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
