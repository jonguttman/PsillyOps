import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import ProductStepTemplateEditor from '@/components/production/ProductStepTemplateEditor';

export default async function ProductStepsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect('/login');

  if (session.user.role === 'REP') {
    redirect('/dashboard');
  }

  const { id: productId } = await params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sku: true },
  });
  if (!product) notFound();

  const steps = await prisma.productionStepTemplate.findMany({
    where: { productId },
    orderBy: { order: 'asc' },
    select: { id: true, key: true, label: true, order: true, required: true },
  });

  const canEdit = ['ADMIN', 'PRODUCTION'].includes(session.user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Steps</h1>
          <p className="mt-1 text-sm text-gray-600">
            {product.name} <span className="text-gray-400">({product.sku})</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/products/${productId}`} className="text-sm text-gray-600 hover:text-gray-900">
            ← Back to product
          </Link>
        </div>
      </div>

      <ProductStepTemplateEditor productId={productId} initialSteps={steps} canEdit={canEdit} />
    </div>
  );
}

