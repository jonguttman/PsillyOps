// Bulk Category Assignment Page
// Admin-only page for assigning categories to multiple products

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import BulkAssignmentClient from './BulkAssignmentClient';

export default async function BulkAssignmentPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can bulk assign
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch all active products with their current categories
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      strain: {
        select: { id: true, name: true, shortCode: true }
      },
      categories: {
        include: {
          category: {
            select: { id: true, name: true, active: true }
          }
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  // Fetch all active categories
  const categories = await prisma.productCategory.findMany({
    where: { active: true },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { products: true } }
    }
  });

  // Fetch all strains for filtering
  const strains = await prisma.strain.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, shortCode: true }
  });

  const formattedProducts = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    strainId: p.strainId,
    strain: p.strain,
    categoryIds: p.categories
      .filter(c => c.category.active)
      .map(c => c.category.id),
  }));

  const formattedCategories = categories.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    productCount: c._count.products,
  }));

  return (
    <BulkAssignmentClient
      products={formattedProducts}
      categories={formattedCategories}
      strains={strains}
    />
  );
}
