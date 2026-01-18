// Product Categories Settings Page
// Admin-only page for managing product categories

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import CategoriesSettingsClient from './CategoriesSettingsClient';

export default async function CategoriesSettingsPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage categories
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch categories with product counts
  const categories = await prisma.productCategory.findMany({
    include: {
      _count: {
        select: {
          products: true,
        }
      }
    },
    orderBy: { displayOrder: 'asc' }
  });

  const formattedCategories = categories.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    displayOrder: c.displayOrder,
    active: c.active,
    productCount: c._count.products,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <CategoriesSettingsClient categories={formattedCategories} />
  );
}
