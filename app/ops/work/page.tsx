/**
 * My Work Page
 * 
 * Shows assigned production work for the current user.
 * Same data, different surfaces for desktop vs mobile.
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { ProductionRunStatus } from '@prisma/client';
import { MobileMyWork, type MobileMyWorkData, type WorkItem } from '@/components/mobile/MobileMyWork';

async function getMyWorkData(userId: string): Promise<MobileMyWorkData> {
  // Fetch production runs that are active (not completed or cancelled)
  const runs = await prisma.productionRun.findMany({
    where: {
      status: { in: [ProductionRunStatus.PLANNED, ProductionRunStatus.IN_PROGRESS] },
      // TODO: Add assignedTo field to ProductionRun for user filtering
      // For now, show all active runs
    },
    include: {
      product: { select: { name: true, sku: true } },
      steps: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          templateKey: true,
          label: true,
          status: true,
          order: true,
        },
      },
    },
    orderBy: [
      { status: 'asc' }, // IN_PROGRESS first
      { createdAt: 'asc' },
    ],
    take: 20,
  });

  const inProgress: WorkItem[] = [];
  const pending: WorkItem[] = [];
  const blocked: WorkItem[] = [];

  for (const run of runs) {
    const currentStep = run.steps.find(s => s.status === 'IN_PROGRESS') 
      || run.steps.find(s => s.status === 'PENDING');
    
    const completedSteps = run.steps.filter(s => s.status === 'COMPLETED').length;
    const totalSteps = run.steps.length;

    // Check if any step is blocked (has SKIPPED status without being intentionally skipped)
    // For now, we don't have a blocked status, so this is always false
    const isBlocked = false;

    const workItem: WorkItem = {
      id: run.id,
      type: 'PRODUCTION_RUN',
      status: isBlocked ? 'BLOCKED' : run.status === ProductionRunStatus.IN_PROGRESS ? 'IN_PROGRESS' : 'PENDING',
      title: run.product.name,
      subtitle: currentStep ? `Step: ${currentStep.label}` : `${run.quantity} units`,
      productName: run.product.name,
      quantity: run.quantity,
      priority: 'NORMAL', // TODO: Add priority field to ProductionRun
      blockedReason: undefined,
      stepInfo: currentStep ? {
        stepId: currentStep.id,
        stepLabel: currentStep.label,
        stepOrder: completedSteps + 1,
        totalSteps,
      } : undefined,
      runId: run.id,
    };

    if (isBlocked) {
      blocked.push(workItem);
    } else if (run.status === ProductionRunStatus.IN_PROGRESS) {
      inProgress.push(workItem);
    } else {
      pending.push(workItem);
    }
  }

  return { inProgress, pending, blocked };
}

export default async function WorkPage() {
  const session = await auth();
  if (!session) {
    redirect('/auth/signin');
  }

  const data = await getMyWorkData(session.user.id);

  return (
    <>
      {/* Desktop view */}
      <div className="hidden md:block">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">My Work</h1>
            <p className="text-gray-500 mt-1">Your assigned production tasks</p>
          </div>
          
          {/* Desktop version uses same component */}
          <MobileMyWork data={data} />
        </div>
      </div>

      {/* Mobile view */}
      <div className="block md:hidden">
        <MobileMyWork data={data} />
      </div>
    </>
  );
}

