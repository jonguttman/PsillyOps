import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { startProductionOrder, blockProductionOrder, completeProductionOrder, createBatch } from '@/lib/services/productionService';

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  BLOCKED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-200 text-gray-600'
};

const BATCH_STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  QC_HOLD: 'bg-yellow-100 text-yellow-800',
  RELEASED: 'bg-green-100 text-green-800',
  EXHAUSTED: 'bg-purple-100 text-purple-800',
  CANCELLED: 'bg-gray-200 text-gray-600'
};

async function handleStart(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');
  const orderId = formData.get('orderId') as string;
  await startProductionOrder(orderId, session.user.id);
  revalidatePath(`/ops/production/${orderId}`);
}

async function handleBlock(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');
  const orderId = formData.get('orderId') as string;
  const reason = formData.get('reason') as string;
  await blockProductionOrder(orderId, reason, session.user.id);
  revalidatePath(`/ops/production/${orderId}`);
}

async function handleComplete(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');
  const orderId = formData.get('orderId') as string;
  await completeProductionOrder(orderId, session.user.id);
  revalidatePath(`/ops/production/${orderId}`);
  revalidatePath('/ops/production');
}

async function handleCreateBatch(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');
  const orderId = formData.get('orderId') as string;
  const productId = formData.get('productId') as string;
  const plannedQuantity = parseInt(formData.get('plannedQuantity') as string);
  
  await createBatch({
    productId,
    plannedQuantity,
    productionOrderId: orderId,
    userId: session.user.id
  });
  
  revalidatePath(`/ops/production/${orderId}`);
}

export default async function ProductionOrderDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const { id } = await params;

  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      product: {
        include: {
          bom: {
            where: { active: true },
            include: { material: true }
          }
        }
      },
      workCenter: true,
      template: true,
      createdBy: { select: { id: true, name: true } },
      batches: {
        include: {
          makers: {
            include: { user: { select: { id: true, name: true } } }
          }
        },
        orderBy: { createdAt: 'asc' }
      },
      materials: {
        include: { material: true },
        orderBy: { material: { name: 'asc' } }
      }
    }
  });

  if (!order) notFound();

  const totalProduced = order.batches.reduce(
    (sum, b) => sum + (b.actualQuantity || 0), 0
  );
  const progress = order.quantityToMake > 0 
    ? Math.round((totalProduced / order.quantityToMake) * 100)
    : 0;
  const hasShortages = order.materials.some(m => m.shortage > 0);
  const allBatchesReleased = order.batches.length > 0 && 
    order.batches.every(b => b.status === 'RELEASED' || b.status === 'EXHAUSTED' || b.status === 'CANCELLED');

  const canStart = order.status === 'PLANNED';
  const canBlock = order.status === 'PLANNED' || order.status === 'IN_PROGRESS';
  const canComplete = order.status === 'IN_PROGRESS' && allBatchesReleased;
  const canCreateBatch = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
              {order.status.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {order.product.name} • {order.quantityToMake} units
          </p>
        </div>
        <div className="flex gap-2">
          {canStart && (
            <form action={handleStart}>
              <input type="hidden" name="orderId" value={id} />
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Start Production
              </button>
            </form>
          )}
          {canComplete && (
            <form action={handleComplete}>
              <input type="hidden" name="orderId" value={id} />
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
              >
                Complete Order
              </button>
            </form>
          )}
          <Link
            href="/ops/production"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back
          </Link>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Production Progress</span>
          <span className="text-gray-500">{totalProduced} / {order.quantityToMake} ({progress}%)</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Overview */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Order Details</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Product</dt>
            <dd className="mt-1 text-sm text-gray-900">
                      <Link href={`/ops/products/${order.productId}`} className="text-blue-600 hover:text-blue-900">
                {order.product.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Quantity</dt>
            <dd className="mt-1 text-sm text-gray-900">{order.quantityToMake}</dd>
          </div>
          {order.batchSize && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Batch Size</dt>
              <dd className="mt-1 text-sm text-gray-900">{order.batchSize}</dd>
            </div>
          )}
          {order.workCenter && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Work Center</dt>
              <dd className="mt-1 text-sm text-gray-900">{order.workCenter.name}</dd>
            </div>
          )}
          {order.template && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Template</dt>
              <dd className="mt-1 text-sm text-gray-900">{order.template.name}</dd>
            </div>
          )}
          {order.scheduledDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Scheduled</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(order.scheduledDate)}</dd>
            </div>
          )}
          {order.dueDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Due Date</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(order.dueDate)}</dd>
            </div>
          )}
          {order.startedAt && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Started</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.startedAt)}</dd>
            </div>
          )}
          {order.completedAt && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Completed</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.completedAt)}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Created By</dt>
            <dd className="mt-1 text-sm text-gray-900">{order.createdBy.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(order.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Material Requirements */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Material Requirements</h2>
          {hasShortages && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              Shortages Detected
            </span>
          )}
        </div>
        {order.materials.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Material</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Required</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Issued</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Remaining</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Shortage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.materials.map(mat => {
                const remaining = mat.requiredQty - mat.issuedQty;
                return (
                  <tr key={mat.id} className={mat.shortage > 0 ? 'bg-red-50' : ''}>
                    <td className="py-2 text-sm">
                      <Link href={`/ops/materials/${mat.materialId}`} className="text-blue-600 hover:text-blue-900">
                        {mat.material.name}
                      </Link>
                    </td>
                    <td className="py-2 text-sm text-right text-gray-900">{mat.requiredQty.toLocaleString()}</td>
                    <td className="py-2 text-sm text-right text-gray-900">{mat.issuedQty.toLocaleString()}</td>
                    <td className="py-2 text-sm text-right text-gray-900">{remaining.toLocaleString()}</td>
                    <td className="py-2 text-sm text-right">
                      {mat.shortage > 0 ? (
                        <span className="text-red-600 font-medium">-{mat.shortage.toLocaleString()}</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No material requirements configured</p>
        )}
      </div>

      {/* Batches */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Batches</h2>
          {canCreateBatch && (
            <form action={handleCreateBatch} className="flex gap-2 items-end">
              <input type="hidden" name="orderId" value={id} />
              <input type="hidden" name="productId" value={order.productId} />
              <div>
                <label className="block text-xs font-medium text-gray-700">Quantity</label>
                <input
                  type="number"
                  name="plannedQuantity"
                  required
                  min="1"
                  defaultValue={order.batchSize || order.quantityToMake}
                  className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Batch
              </button>
            </form>
          )}
        </div>
        {order.batches.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Batch Code</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Status</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Planned</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Actual</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Makers</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.batches.map(batch => (
                <tr key={batch.id}>
                  <td className="py-2 text-sm">
                    <Link href={`/ops/batches/${batch.id}`} className="text-blue-600 hover:text-blue-900 font-medium">
                      {batch.batchCode}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${BATCH_STATUS_COLORS[batch.status]}`}>
                      {batch.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-2 text-sm text-right text-gray-900">{batch.plannedQuantity}</td>
                  <td className="py-2 text-sm text-right text-gray-900">{batch.actualQuantity ?? '-'}</td>
                  <td className="py-2 text-sm text-gray-500">
                    {batch.makers.length > 0 
                      ? batch.makers.map(m => m.user.name).join(', ')
                      : '-'
                    }
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/ops/batches/${batch.id}`} className="text-sm text-blue-600 hover:text-blue-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No batches created yet</p>
        )}
      </div>

      {/* Block Order Form */}
      {canBlock && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-red-900 mb-4">Block Production Order</h3>
          <form action={handleBlock} className="space-y-4">
            <input type="hidden" name="orderId" value={id} />
            <div>
              <label className="block text-sm font-medium text-gray-700">Reason for blocking</label>
              <input
                type="text"
                name="reason"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                placeholder="e.g., Material shortage, QC issue, Equipment failure"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
            >
              Block Order
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
