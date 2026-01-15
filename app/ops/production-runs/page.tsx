import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { computeRunHealth } from '@/lib/services/productionRunService';

export default async function ProductionRunsPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');

  if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
    redirect('/ops/dashboard');
  }

  const runs = await prisma.productionRun.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      steps: { select: { status: true, required: true, startedAt: true } },
    },
  });

  const statusColors: Record<string, string> = {
    PLANNED: 'bg-gray-100 text-gray-700 border-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
    COMPLETED: 'bg-green-100 text-green-800 border-green-200',
    CANCELLED: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Runs</h1>
          <p className="mt-1 text-sm text-gray-600">
            Recent runs (read-only list). Create a run via AI (“Make …”) or the API.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/m/scan"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Mobile Scan
          </Link>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-600">
          No production runs yet.
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-100">
            {runs.map((r) => {
              const total = r.steps.length;
              const done = r.steps.filter((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED').length;
              const health = computeRunHealth({
                runStatus: r.status as any,
                steps: r.steps.map((s) => ({ status: s.status as any, required: s.required, startedAt: s.startedAt })),
              });
              const hasWarning = health.hasRequiredSkips || health.hasStalledStep || health.isBlocked;
              return (
                <Link
                  key={r.id}
                  href={`/ops/production-runs/${r.id}`}
                  className="block px-5 py-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-2">
                        {r.product.name}
                        {hasWarning ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Needs attention
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500">
                        Qty {r.quantity} • {r.product.sku} • Steps {done}/{total} • {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                        statusColors[r.status] || statusColors.PLANNED
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

