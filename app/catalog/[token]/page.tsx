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
  getCatalogProducts
} from '@/lib/services/catalogLinkService';
import { CatalogClientWrapper } from './CatalogClientWrapper';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function CatalogPage({ params }: PageProps) {
  const { token } = await params;

  // Check if viewer is an internal user (ADMIN or REP)
  const session = await auth();
  const isInternalUser = session?.user?.role === 'ADMIN' || session?.user?.role === 'REP';

  // Get request metadata for tracking
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || undefined;
  const userAgent = headersList.get('user-agent') || undefined;

  // Resolve catalog - skip tracking for internal users
  const resolution = await resolveCatalogToken(
    token,
    { ip, userAgent },
    { skipTracking: isInternalUser }
  );

  if (!resolution) {
    notFound();
  }

  // Get products with custom pricing applied
  const products = await getCatalogProducts(resolution.id);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Show internal user banner */}
      {isInternalUser && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">
            Internal preview - this view is not counted in analytics
          </p>
        </div>
      )}
      <CatalogClientWrapper
        token={token}
        catalogLinkId={resolution.id}
        displayName={resolution.displayName}
        products={products}
        isInternalView={isInternalUser}
      />
    </div>
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
