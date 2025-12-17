import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import InitialInventoryClient from './InitialInventoryClient';

export default async function InitialInventorySetupPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  
  // Only ADMIN and WAREHOUSE can add initial inventory
  if (session.user.role !== 'ADMIN' && session.user.role !== 'WAREHOUSE') {
    redirect('/ops/dashboard');
  }

  // Fetch materials and products for the dropdown
  const [materials, products, locations] = await Promise.all([
    prisma.rawMaterial.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        unitOfMeasure: true,
        currentStockQty: true
      },
      orderBy: { name: 'asc' }
    }),
    prisma.product.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        unitOfMeasure: true
      },
      orderBy: { name: 'asc' }
    }),
    prisma.location.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        isDefaultReceiving: true
      },
      orderBy: { name: 'asc' }
    })
  ]);

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Initial Inventory Setup</h1>
          <p className="mt-2 text-sm text-gray-600">
            Add starting inventory quantities for materials and products. This is typically used once during initial system setup.
          </p>
        </div>

        <InitialInventoryClient
          materials={materials}
          products={products}
          locations={locations}
        />
      </div>
    </div>
  );
}

