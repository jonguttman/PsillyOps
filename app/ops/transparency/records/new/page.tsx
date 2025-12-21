/**
 * Create New Transparency Record
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import TransparencyRecordForm from '../TransparencyRecordForm';

export default async function NewTransparencyRecordPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch data for dropdowns
  const [products, batches, labs] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, sku: true },
      orderBy: { name: 'asc' },
    }),
    prisma.batch.findMany({
      select: {
        id: true,
        batchCode: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.lab.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <TransparencyRecordForm
      products={products}
      batches={batches.map(b => ({
        id: b.id,
        batchCode: b.batchCode,
        productName: b.product.name,
      }))}
      labs={labs}
    />
  );
}
