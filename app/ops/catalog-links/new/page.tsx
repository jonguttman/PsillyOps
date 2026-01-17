/**
 * Create New Catalog Link Page
 */

import { prisma } from '@/lib/db/prisma';
import { NewCatalogLinkForm } from './NewCatalogLinkForm';

async function getRetailers() {
  return prisma.retailer.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  });
}

async function getProducts() {
  return prisma.product.findMany({
    where: { active: true, wholesalePrice: { not: null } },
    select: { id: true, name: true, sku: true, wholesalePrice: true },
    orderBy: { name: 'asc' }
  });
}

export default async function NewCatalogLinkPage() {
  const [retailers, products] = await Promise.all([getRetailers(), getProducts()]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create Catalog Link</h1>
        <p className="text-gray-500 mt-1">
          Generate a shareable product catalog for a retailer
        </p>
      </div>

      <NewCatalogLinkForm retailers={retailers} products={products} />
    </div>
  );
}
