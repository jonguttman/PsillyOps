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

  const steps = await prisma.productionRunStep.findMany({
    where: {
      assignedToUserId: session.user.id,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      productionRun: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
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

  const statusColors: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Work</h1>
          <p className="mt-1 text-sm text-gray-600">Steps assigned to you.</p>
        </div>
        <Link href="/ops/production-runs" className="text-sm text-gray-600 hover:text-gray-900">
          ← Production Runs
        </Link>
      </div>

      {steps.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
          No assigned steps right now.
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-100">
          {steps.map((s) => (
            <div key={s.id} className="px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {s.productionRun.product.name} <span className="text-gray-400">({s.productionRun.product.sku})</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Run qty {s.productionRun.quantity} • Run {s.productionRun.status} • Step {s.order}: {s.label}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                    statusColors[s.status] || statusColors.PENDING
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
      )}
    </div>
  );
}

