import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { completeBatch, updateBatchStatus, setBatchQCStatus, addLaborEntry } from '@/lib/services/productionService';
import { BatchStatus, QCStatus } from '@prisma/client';

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  QC_HOLD: 'bg-yellow-100 text-yellow-800',
  RELEASED: 'bg-green-100 text-green-800',
  EXHAUSTED: 'bg-purple-100 text-purple-800',
  CANCELLED: 'bg-gray-200 text-gray-600'
};

const QC_STATUS_COLORS: Record<string, string> = {
  NOT_REQUIRED: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  HOLD: 'bg-orange-100 text-orange-800',
  PASSED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800'
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

async function handleComplete(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const batchId = formData.get('batchId') as string;
  const actualQuantity = parseInt(formData.get('actualQuantity') as string);
  const locationId = formData.get('locationId') as string;
  const expectedYield = formData.get('expectedYield') ? parseFloat(formData.get('expectedYield') as string) : undefined;
  const lossQty = formData.get('lossQty') ? parseFloat(formData.get('lossQty') as string) : undefined;
  const lossReason = formData.get('lossReason') as string || undefined;
  const qcRequired = formData.get('qcRequired') === 'true';

  await completeBatch({
    batchId,
    actualQuantity,
    locationId,
    expectedYield,
    lossQty,
    lossReason,
    qcRequired,
    userId: session.user.id
  });

  revalidatePath(`/batches/${batchId}`);
}

async function handleStatusChange(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const batchId = formData.get('batchId') as string;
  const status = formData.get('status') as BatchStatus;

  await updateBatchStatus(batchId, status, session.user.id);
  revalidatePath(`/batches/${batchId}`);
}

async function handleQCUpdate(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const batchId = formData.get('batchId') as string;
  const qcStatus = formData.get('qcStatus') as QCStatus;
  const notes = formData.get('notes') as string || undefined;

  await setBatchQCStatus(batchId, qcStatus, session.user.id, notes);
  revalidatePath(`/batches/${batchId}`);
}

async function handleAddLabor(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const batchId = formData.get('batchId') as string;
  const userId = formData.get('userId') as string;
  const minutes = parseInt(formData.get('minutes') as string);
  const role = formData.get('role') as string || undefined;
  const notes = formData.get('notes') as string || undefined;

  await addLaborEntry({
    batchId,
    userId,
    minutes,
    role,
    notes,
    loggedByUserId: session.user.id
  });

  revalidatePath(`/batches/${batchId}`);
}

export default async function BatchDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const { id } = await params;

  const [batch, movements, locations, users] = await Promise.all([
    prisma.batch.findUnique({
      where: { id },
      include: {
        product: true,
        productionOrder: {
          include: { workCenter: true }
        },
        makers: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        laborEntries: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        },
        inventory: {
          include: { location: true }
        }
      }
    }),
    prisma.inventoryMovement.findMany({
      where: { batchId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    prisma.location.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'PRODUCTION', 'WAREHOUSE'] } },
      orderBy: { name: 'asc' }
    })
  ]);

  if (!batch) notFound();

  const laborTotalMinutes = batch.laborEntries.reduce((sum, e) => sum + e.minutes, 0);
  const laborTotalHours = Math.round((laborTotalMinutes / 60) * 100) / 100;

  const canComplete = batch.status === 'PLANNED' || batch.status === 'IN_PROGRESS';
  const canUpdateQC = batch.qcStatus !== 'NOT_REQUIRED';
  const yieldVariance = batch.expectedYield && batch.actualYield 
    ? batch.actualYield - batch.expectedYield 
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{batch.batchCode}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[batch.status]}`}>
              {batch.status.replace('_', ' ')}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${QC_STATUS_COLORS[batch.qcStatus]}`}>
              QC: {batch.qcStatus.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {batch.product.name}
            {batch.productionOrder && (
              <> • <Link href={`/production/${batch.productionOrder.id}`} className="text-blue-600 hover:text-blue-900">{batch.productionOrder.orderNumber}</Link></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/qr/batch/${batch.id}`}
            target="_blank"
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            title="View QR Code"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </Link>
          <Link
            href={batch.productionOrder ? `/production/${batch.productionOrder.id}` : '/batches'}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back
          </Link>
        </div>
      </div>

      {/* Overview */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Batch Details</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Product</dt>
            <dd className="mt-1">
              <Link href={`/products/${batch.productId}`} className="text-sm text-blue-600 hover:text-blue-900">
                {batch.product.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Planned Quantity</dt>
            <dd className="mt-1 text-sm text-gray-900">{batch.plannedQuantity}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Actual Quantity</dt>
            <dd className="mt-1 text-sm text-gray-900">{batch.actualQuantity ?? '-'}</dd>
          </div>
          {batch.productionDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Production Date</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(batch.productionDate)}</dd>
            </div>
          )}
          {batch.manufactureDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Manufacture Date</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(batch.manufactureDate)}</dd>
            </div>
          )}
          {batch.expirationDate && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Expiration Date</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(batch.expirationDate)}</dd>
            </div>
          )}
          {batch.productionOrder?.workCenter && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Work Center</dt>
              <dd className="mt-1 text-sm text-gray-900">{batch.productionOrder.workCenter.name}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDateTime(batch.createdAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Yield Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Yield & Loss Tracking</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500">Expected Yield</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              {batch.expectedYield ?? batch.plannedQuantity}
            </dd>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500">Actual Yield</dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              {batch.actualYield ?? '-'}
            </dd>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500">Loss Quantity</dt>
            <dd className="mt-1 text-2xl font-semibold text-red-600">
              {batch.lossQty ?? '-'}
            </dd>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <dt className="text-sm font-medium text-gray-500">Variance</dt>
            <dd className={`mt-1 text-2xl font-semibold ${yieldVariance && yieldVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {yieldVariance !== null ? (yieldVariance >= 0 ? '+' : '') + yieldVariance : '-'}
            </dd>
          </div>
        </dl>
        {batch.lossReason && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg">
            <span className="text-sm font-medium text-red-800">Loss Reason: </span>
            <span className="text-sm text-red-700">{batch.lossReason}</span>
          </div>
        )}
      </div>

      {/* QC Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quality Control</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${QC_STATUS_COLORS[batch.qcStatus]}`}>
              {batch.qcStatus.replace('_', ' ')}
            </span>
            {batch.qcStatus === 'PASSED' && (
              <span className="text-sm text-green-600">Batch passed QC and is available for sale</span>
            )}
            {batch.qcStatus === 'FAILED' && (
              <span className="text-sm text-red-600">Batch failed QC and is quarantined</span>
            )}
            {batch.qcStatus === 'HOLD' && (
              <span className="text-sm text-orange-600">Batch is on hold pending review</span>
            )}
          </div>
        </div>
        {canUpdateQC && (
          <form action={handleQCUpdate} className="mt-4 p-4 bg-gray-50 rounded-lg">
            <input type="hidden" name="batchId" value={id} />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Update QC Status</label>
                <select
                  name="qcStatus"
                  defaultValue={batch.qcStatus}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="PENDING">Pending</option>
                  <option value="HOLD">Hold</option>
                  <option value="PASSED">Passed</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
                <input
                  type="text"
                  name="notes"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="QC notes..."
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  Update QC
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Labor Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Labor Tracking</h2>
          <div className="text-sm text-gray-500">
            Total: <span className="font-medium text-gray-900">{laborTotalMinutes} min ({laborTotalHours} hrs)</span>
          </div>
        </div>
        
        {/* Add Labor Form */}
        <form action={handleAddLabor} className="mb-6 p-4 bg-gray-50 rounded-lg">
          <input type="hidden" name="batchId" value={id} />
          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Worker</label>
              <select
                name="userId"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">Select...</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Minutes</label>
              <input
                type="number"
                name="minutes"
                required
                min="1"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="e.g., 60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <input
                type="text"
                name="role"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="e.g., Mixer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <input
                type="text"
                name="notes"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Add Labor
              </button>
            </div>
          </div>
        </form>

        {/* Labor Entries Table */}
        {batch.laborEntries.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Worker</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Minutes</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batch.laborEntries.map(entry => (
                <tr key={entry.id}>
                  <td className="py-2 text-sm text-gray-500">{formatDateTime(entry.createdAt)}</td>
                  <td className="py-2 text-sm text-gray-900">{entry.user.name}</td>
                  <td className="py-2 text-sm text-right text-gray-900">{entry.minutes}</td>
                  <td className="py-2 text-sm text-gray-500">{entry.role || '-'}</td>
                  <td className="py-2 text-sm text-gray-500">{entry.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No labor entries recorded</p>
        )}
      </div>

      {/* Movements Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Inventory Movements</h2>
        {movements.length > 0 ? (
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
              {movements.map(movement => (
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
          <p className="text-sm text-gray-500">No movements recorded</p>
        )}
      </div>

      {/* Inventory */}
      {batch.inventory.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Finished Goods Inventory</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Location</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Quantity</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Status</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batch.inventory.map(inv => (
                <tr key={inv.id}>
                  <td className="py-2 text-sm text-gray-900">{inv.location.name}</td>
                  <td className="py-2 text-sm text-right text-gray-900">{inv.quantityOnHand.toLocaleString()} {inv.unitOfMeasure}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      inv.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                      inv.status === 'QUARANTINED' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/inventory/${inv.id}`} className="text-sm text-blue-600 hover:text-blue-900">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Complete Batch Form */}
      {canComplete && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-green-900 mb-4">Complete Batch</h3>
          <form action={handleComplete} className="space-y-4">
            <input type="hidden" name="batchId" value={id} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Actual Quantity *</label>
                <input
                  type="number"
                  name="actualQuantity"
                  required
                  min="0"
                  defaultValue={batch.plannedQuantity}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Location *</label>
                <select
                  name="locationId"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                >
                  <option value="">Select location...</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expected Yield</label>
                <input
                  type="number"
                  name="expectedYield"
                  min="0"
                  defaultValue={batch.expectedYield ?? batch.plannedQuantity}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Loss Qty</label>
                <input
                  type="number"
                  name="lossQty"
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Loss Reason</label>
                <input
                  type="text"
                  name="lossReason"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm"
                  placeholder="e.g., Material waste, Equipment issue"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="qcRequired"
                  value="true"
                  id="qcRequired"
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                />
                <label htmlFor="qcRequired" className="ml-2 block text-sm text-gray-700">
                  QC Required (hold inventory)
                </label>
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
            >
              Complete Batch
            </button>
          </form>
        </div>
      )}

      {/* Status Change */}
      {(batch.status === 'PLANNED') && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-medium text-blue-900 mb-4">Start Batch Production</h3>
          <form action={handleStatusChange}>
            <input type="hidden" name="batchId" value={id} />
            <input type="hidden" name="status" value="IN_PROGRESS" />
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Start Production
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
