// Retailer Catalog Page
// View products organized by category

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { getCatalogData } from '@/lib/services/productCategoryService';
import CatalogClient from './CatalogClient';

export default async function CatalogPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // REP role is allowed to view the catalog
  const allowedRoles = ['ADMIN', 'PRODUCTION', 'WAREHOUSE', 'REP'];
  if (!allowedRoles.includes(session.user.role)) {
    redirect('/ops/dashboard');
  }

  const catalogData = await getCatalogData();

  return <CatalogClient categories={catalogData} isAdmin={session.user.role === 'ADMIN'} />;
}
