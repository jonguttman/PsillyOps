/**
 * Public Product Catalog Page
 *
 * Shareable catalog view for retailers with custom pricing and product selection.
 * No authentication required - accessed via unique token.
 */

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import {
  resolveCatalogToken,
  getCatalogProducts
} from '@/lib/services/catalogLinkService';
import { CatalogHeader } from '@/components/catalog/CatalogHeader';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CatalogClientWrapper } from './CatalogClientWrapper';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function CatalogPage({ params }: PageProps) {
  const { token } = await params;

  // Get request metadata for tracking
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || undefined;
  const userAgent = headersList.get('user-agent') || undefined;

  // Resolve and track the catalog view
  const resolution = await resolveCatalogToken(token, { ip, userAgent });

  if (!resolution) {
    notFound();
  }

  // Get products with custom pricing applied
  const products = await getCatalogProducts(resolution.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <CatalogClientWrapper
        token={token}
        catalogLinkId={resolution.id}
        displayName={resolution.displayName}
        products={products}
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
