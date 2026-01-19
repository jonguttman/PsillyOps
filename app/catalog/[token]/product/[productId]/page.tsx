/**
 * Product Detail Page
 *
 * Shows detailed product information with cart integration and inquiry form.
 * Tracks product views for analytics (skips for internal users).
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/auth';
import {
  getCatalogLinkByToken,
  getCatalogProduct,
  trackProductView,
  getExpiredCatalogInfo
} from '@/lib/services/catalogLinkService';
import { ProductDetailClient } from './ProductDetailClient';

interface PageProps {
  params: Promise<{ token: string; productId: string }>;
  searchParams: Promise<{ internal?: string; preview?: string }>;
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { token, productId } = await params;
  const { internal, preview } = await searchParams;

  // Check if viewer is an internal user (ADMIN or REP)
  const session = await auth();
  const isLoggedInInternal = session?.user?.role === 'ADMIN' || session?.user?.role === 'REP';

  // Allow preview mode to show retailer experience
  const previewAsRetailer = preview === 'retailer';
  const isInternalView = isLoggedInInternal && !previewAsRetailer;

  // Legacy support for ?internal=true param
  const legacyInternal = internal === 'true' && !previewAsRetailer;

  // Get request metadata for tracking
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || undefined;
  const userAgent = headersList.get('user-agent') || undefined;

  // Get catalog link
  const catalogLink = await getCatalogLinkByToken(token);

  if (!catalogLink) {
    notFound();
  }

  // Check if expired or not active
  const isExpired =
    catalogLink.status !== 'ACTIVE' ||
    (catalogLink.expiresAt && catalogLink.expiresAt < new Date());

  if (isExpired) {
    // Check if we should show the expired landing page (not for revoked tokens)
    const expiredInfo = await getExpiredCatalogInfo(token);

    if (expiredInfo) {
      redirect(`/catalog/${token}/expired`);
    }

    notFound();
  }

  // Get product
  const product = await getCatalogProduct(catalogLink.id, productId);

  if (!product) {
    notFound();
  }

  // Determine if we should skip tracking (internal view or legacy param)
  const skipTracking = isInternalView || legacyInternal;

  // Track the product view (skip for internal views)
  await trackProductView(catalogLink.id, productId, { ip, userAgent }, { skipTracking });

  const displayName = catalogLink.displayName || catalogLink.retailer.name;

  return (
    <ProductDetailClient
      token={token}
      catalogLinkId={catalogLink.id}
      productId={productId}
      product={product}
      displayName={displayName}
      isInternalView={skipTracking}
    />
  );
}

export async function generateMetadata({ params }: PageProps) {
  return {
    title: 'Product Details',
    description: 'View product details and submit an inquiry',
    robots: 'noindex, nofollow'
  };
}
