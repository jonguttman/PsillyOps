import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export default async function MyWorkPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');

  if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
    redirect('/ops/dashboard');
  }

  // Fetch both assigned runs and assigned steps in parallel
  const [assignedRuns, assignedSteps] = await Promise.all([
    // Production runs assigned to this user
    prisma.productionRun.findMany({
      where: {
        assignedToUserId: session.user.id,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      select: {
        id: true,
        status: true,
        quantity: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true } },
        steps: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
          orderBy: { order: 'asc' },
          take: 1,
          select: { id: true, order: true, label: true, status: true },
        },
      },
      orderBy: [{ status: 'desc' }, { createdAt: 'asc' }],
    }),
    // Individual steps assigned to this user (legacy/step-level assignment)
    prisma.productionRunStep.findMany({
      where: {
        assignedToUserId: session.user.id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        productionRun: { 
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
          // Exclude runs already assigned to this user (avoid duplicates)
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
    }),
  ]);

  const runStatusColors: Record<string, string> = {
    PLANNED: 'bg-gray-100 text-gray-700 border-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const stepStatusColors: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const hasWork = assignedRuns.length > 0 || assignedSteps.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Work</h1>
          <p className="mt-1 text-sm text-gray-600">
            Production runs and steps assigned to you.
          </p>
        </div>
        <Link href="/ops/production-runs" className="text-sm text-gray-600 hover:text-gray-900">
          ← Production Runs
        </Link>
      </div>

      {!hasWork ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
          No assigned work right now.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Assigned Production Runs */}
          {assignedRuns.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Assigned Runs ({assignedRuns.length})
              </h2>
              <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-100">
                {assignedRuns.map((run) => {
                  const nextStep = run.steps[0];
                  return (
                    <div key={run.id} className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {run.product.name}{' '}
                          <span className="text-gray-400">({run.product.sku})</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Qty {run.quantity}
                          {nextStep && (
                            <> • Next: Step {nextStep.order}: {nextStep.label}</>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                            runStatusColors[run.status] || runStatusColors.PLANNED
                          }`}
                        >
                          {run.status}
                        </span>
                        <Link
                          href={`/ops/production-runs/${run.id}`}
                          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          {run.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assigned Steps (step-level assignment) */}
          {assignedSteps.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-3">
                Assigned Steps ({assignedSteps.length})
              </h2>
              <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-100">
                {assignedSteps.map((s) => (
                  <div key={s.id} className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {s.productionRun.product.name}{' '}
                        <span className="text-gray-400">({s.productionRun.product.sku})</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Run qty {s.productionRun.quantity} • Run {s.productionRun.status} • Step{' '}
                        {s.order}: {s.label}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          stepStatusColors[s.status] || stepStatusColors.PENDING
                        }`}
                      >
                        {s.status}
                      </span>
                      <Link
                        href={`/ops/production-runs/${s.productionRun.id}`}
                        className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      >
                        Resume
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

