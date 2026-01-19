/**
 * Public Product Catalog Page
 *
 * Shareable catalog view for retailers with custom pricing and product selection.
 * No authentication required - accessed via unique token.
 * Internal views (ADMIN/REP) are not tracked in analytics.
 */

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import {
  resolveCatalogToken,
  getCatalogProducts,
  getCatalogCategoriesWithProducts
} from '@/lib/services/catalogLinkService';
import { CatalogClientWrapper } from './CatalogClientWrapper';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export default async function CatalogPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { preview } = await searchParams;

  // Check if viewer is an internal user (ADMIN or REP)
  const session = await auth();
  const isInternalUser = session?.user?.role === 'ADMIN' || session?.user?.role === 'REP';

  // Allow preview mode to show retailer experience (via URL param)
  const previewAsRetailer = preview === 'retailer';

  // Get request metadata for tracking
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || undefined;
  const userAgent = headersList.get('user-agent') || undefined;

  // Resolve catalog - skip tracking for internal users (unless previewing as retailer)
  const resolution = await resolveCatalogToken(
    token,
    { ip, userAgent },
    { skipTracking: isInternalUser && !previewAsRetailer }
  );

  if (!resolution) {
    notFound();
  }

  // Get products with custom pricing applied (flat list for grid view)
  const products = await getCatalogProducts(resolution.id);

  // Get products grouped by category (for carousel view)
  const categories = await getCatalogCategoriesWithProducts(resolution.id);

  return (
    <CatalogClientWrapper
      token={token}
      catalogLinkId={resolution.id}
      displayName={resolution.displayName}
      products={products}
      categories={categories}
      isInternalUser={isInternalUser}
      initialPreviewMode={previewAsRetailer}
    />
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;

  // Simple metadata without tracking
  return {
    title: 'Product Catalog',
    description: 'Browse our wholesale product catalog',
    robots: 'noindex, nofollow' // Don't index catalog pages
  };
}
