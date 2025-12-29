import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { MyWorkClient } from './MyWorkClient';

export default async function MyWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');

  if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
    redirect('/ops/dashboard');
  }

  const { view } = await searchParams;
  const isAdmin = session.user.role === 'ADMIN';
  const showAllWork = isAdmin && view === 'all';

  // Fetch production orders assigned to this user (or all active if admin viewing all)
  const assignedOrders = await prisma.productionOrder.findMany({
    where: showAllWork 
      ? { status: { in: ['PLANNED', 'IN_PROGRESS'] } }
      : { assignedToUserId: session.user.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      quantityToMake: true,
      scheduledDate: true,
      createdAt: true,
      product: { select: { id: true, name: true, sku: true } },
      assignedTo: { select: { id: true, name: true } },
      productionRuns: {
        select: {
          id: true,
          status: true,
          quantity: true,
          batches: {
            select: {
              id: true,
              batchCode: true,
              status: true,
              plannedQuantity: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          steps: {
            where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
            orderBy: { order: 'asc' },
            take: 3,
            select: { 
              id: true, 
              order: true, 
              label: true, 
              status: true,
              stepType: true,
              estimatedMinutes: true,
            },
          },
        },
      },
    },
    orderBy: [{ status: 'desc' }, { scheduledDate: 'asc' }, { createdAt: 'asc' }],
  });

  // Also fetch production runs directly assigned to this user (without a linked order or different assignee)
  const assignedRuns = await prisma.productionRun.findMany({
    where: showAllWork
      ? { 
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          // For "all work" view, show runs without orders or with unassigned orders
          OR: [
            { productionOrderId: null },
            { productionOrder: { assignedToUserId: null } },
          ],
        }
      : {
          assignedToUserId: session.user.id,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          // Exclude runs that are part of an order already assigned to this user
          OR: [
            { productionOrderId: null },
            { 
              productionOrder: { 
                NOT: { assignedToUserId: session.user.id } 
              } 
            },
          ],
        },
    select: {
      id: true,
      status: true,
      quantity: true,
      createdAt: true,
      product: { select: { id: true, name: true, sku: true } },
      assignedTo: { select: { id: true, name: true } },
      batches: {
        select: {
          id: true,
          batchCode: true,
          status: true,
          plannedQuantity: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      steps: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        orderBy: { order: 'asc' },
        take: 3,
        select: { 
          id: true, 
          order: true, 
          label: true, 
          status: true,
          stepType: true,
          estimatedMinutes: true,
        },
      },
    },
    orderBy: [{ status: 'desc' }, { createdAt: 'asc' }],
  });

  // Legacy: Individual steps assigned to this user (or all unassigned for admin "all" view)
  const assignedSteps = await prisma.productionRunStep.findMany({
    where: showAllWork
      ? {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          productionRun: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
        }
      : {
          assignedToUserId: session.user.id,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          productionRun: { 
            status: { in: ['PLANNED', 'IN_PROGRESS'] },
            NOT: { assignedToUserId: session.user.id },
          },
        },
    include: {
      productionRun: {
        select: {
          id: true,
          status: true,
          quantity: true,
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
    orderBy: [{ status: 'desc' }, { order: 'asc' }],
  });

  const hasWork = assignedOrders.length > 0 || assignedRuns.length > 0 || assignedSteps.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {showAllWork ? 'All Production Work' : 'My Work'}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {showAllWork 
              ? 'All active production orders and runs across the team.'
              : 'Production orders and runs assigned to you.'
            }
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {isAdmin && (
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <Link 
                href="/ops/production-runs/my-work"
                className={`px-3 py-1.5 text-sm font-medium ${
                  !showAllWork 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                My Work
              </Link>
              <Link 
                href="/ops/production-runs/my-work?view=all"
                className={`px-3 py-1.5 text-sm font-medium ${
                  showAllWork 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                All Work
              </Link>
            </div>
          )}
          <div className="flex gap-3">
            <Link href="/ops/production" className="text-sm text-gray-600 hover:text-gray-900">
              Production Orders
            </Link>
            <Link href="/ops/production-runs" className="text-sm text-gray-600 hover:text-gray-900">
              Production Runs
            </Link>
          </div>
        </div>
      </div>

      {!hasWork ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-gray-400 text-4xl mb-3">📋</div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No assigned work</h3>
          <p className="text-sm text-gray-500">
            You don&apos;t have any production orders or runs assigned to you right now.
          </p>
        </div>
      ) : (
        <MyWorkClient 
          assignedOrders={assignedOrders}
          assignedRuns={assignedRuns}
          assignedSteps={assignedSteps}
          isAdmin={isAdmin}
          showAllWork={showAllWork}
        />
      )}
    </div>
  );
}
