import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getProductionRun } from '@/lib/services/productionRunService';
import { getBaseUrl } from '@/lib/services/qrTokenService';
import ProductionRunClient from '@/components/production/ProductionRunClient';
import type { ProductionRunApiDetail } from '@/components/production/ProductionRunClient';

export default async function ProductionRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');

  if (!['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'].includes(session.user.role)) {
    redirect('/dashboard');
  }

  const { id } = await params;

  let run;
  try {
    run = await getProductionRun(id);
  } catch {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const qrUrl = run.qrToken?.token ? `${baseUrl}/qr/${run.qrToken.token}` : null;

  const initial: ProductionRunApiDetail['run'] = {
    id: run.id,
    productId: run.productId,
    product: run.product,
    quantity: run.quantity,
    status: run.status as ProductionRunApiDetail['run']['status'],
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    qr: run.qrToken
      ? {
          id: run.qrToken.id,
          token: run.qrToken.token,
          status: run.qrToken.status,
          url: qrUrl,
        }
      : null,
    steps: run.steps.map((s) => ({
      id: s.id,
      templateKey: s.templateKey,
      label: s.label,
      order: s.order,
      required: s.required,
      status: s.status as ProductionRunApiDetail['run']['steps'][number]['status'],
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      skippedAt: s.skippedAt ? s.skippedAt.toISOString() : null,
      skipReason: s.skipReason,
      performedById: s.performedById,
      assignedToUserId: (s as unknown as { assignedToUserId?: string | null }).assignedToUserId ?? null,
    })),
    currentStep: null,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back
        </Link>
      </div>

      <ProductionRunClient
        runId={run.id}
        initial={initial}
        userRole={session.user.role}
        userId={session.user.id}
      />
    </div>
  );
}

