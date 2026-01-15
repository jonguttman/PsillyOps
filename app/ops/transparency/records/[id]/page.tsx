/**
 * Edit Transparency Record
 */

import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import TransparencyRecordForm from '../TransparencyRecordForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTransparencyRecordPage({ params }: PageProps) {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const { id } = await params;

  // Fetch the record
  const record = await prisma.transparencyRecord.findUnique({
    where: { id },
  });

  if (!record) {
    notFound();
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
      record={{
        id: record.id,
        entityType: record.entityType,
        entityId: record.entityId,
        productionDate: record.productionDate.toISOString(),
        batchCode: record.batchCode,
        labId: record.labId,
        testDate: record.testDate?.toISOString() || null,
        testResult: record.testResult,
        rawMaterialLinked: record.rawMaterialLinked,
        publicDescription: record.publicDescription,
      }}
    />
  );
}
