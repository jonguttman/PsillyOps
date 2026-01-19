/**
 * Public Product Catalog Page
 *
 * Shareable catalog view for retailers with custom pricing and product selection.
 * No authentication required - accessed via unique token.
 * Internal views (ADMIN/REP) are not tracked in analytics.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import {
  resolveCatalogToken,
  getCatalogProducts,
  getExpiredCatalogInfo
} from '@/lib/services/catalogLinkService';
import { trackIntroSheetScan } from '@/lib/services/introSheetService';
import { CatalogClientWrapper } from './CatalogClientWrapper';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string; ref?: string }>;
}

export default async function CatalogPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { preview, ref } = await searchParams;

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
    // Check if token exists but is expired (not revoked - revoked shows 404)
    const expiredInfo = await getExpiredCatalogInfo(token);

    if (expiredInfo) {
      // Redirect to expired landing page with renewal form
      redirect(`/catalog/${token}/expired`);
    }

    // Token doesn't exist or is revoked
    notFound();
  }

  // Get products with custom pricing applied
  const products = await getCatalogProducts(resolution.id);

  // Track intro sheet scans (when accessed via QR code with ref=intro_sheet)
  if (ref === 'intro_sheet') {
    await trackIntroSheetScan(resolution.id, { ip, userAgent });
  }

  return (
    <CatalogClientWrapper
      token={token}
      catalogLinkId={resolution.id}
      displayName={resolution.displayName}
      products={products}
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
