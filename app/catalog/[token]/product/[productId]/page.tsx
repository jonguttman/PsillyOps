/**
 * Product Detail Page
 *
 * Shows detailed product information with inquiry form.
 * Tracks product views for analytics (skips for internal users).
 */

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowLeft, Package, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import {
  getCatalogLinkByToken,
  getCatalogProduct,
  trackProductView
} from '@/lib/services/catalogLinkService';
import { InquiryForm } from '@/components/catalog/InquiryForm';

interface PageProps {
  params: Promise<{ token: string; productId: string }>;
  searchParams: Promise<{ internal?: string }>;
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const { token, productId } = await params;
  const { internal } = await searchParams;

  // Check if this is an internal (admin/rep) view
  const isInternalView = internal === 'true';

  // Get request metadata for tracking
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || undefined;
  const userAgent = headersList.get('user-agent') || undefined;

  // Get catalog link
  const catalogLink = await getCatalogLinkByToken(token);

  if (!catalogLink || catalogLink.status !== 'ACTIVE') {
    notFound();
  }

  // Check expiration
  if (catalogLink.expiresAt && catalogLink.expiresAt < new Date()) {
    notFound();
  }

  // Get product
  const product = await getCatalogProduct(catalogLink.id, productId);

  if (!product) {
    notFound();
  }

  // Track the product view (skip for internal views)
  await trackProductView(catalogLink.id, productId, { ip, userAgent }, { skipTracking: isInternalView });

  const displayName = catalogLink.displayName || catalogLink.retailer.name;

  const stockBadge = {
    IN_STOCK: {
      label: 'In Stock',
      description: 'Ready to ship',
      icon: CheckCircle,
      className: 'bg-green-100 text-green-800',
      iconClassName: 'text-green-500'
    },
    LOW_STOCK: {
      label: 'Low Stock',
      description: 'Limited availability',
      icon: AlertTriangle,
      className: 'bg-yellow-100 text-yellow-800',
      iconClassName: 'text-yellow-500'
    },
    OUT_OF_STOCK: {
      label: 'Out of Stock',
      description: 'Currently unavailable',
      icon: XCircle,
      className: 'bg-red-100 text-red-800',
      iconClassName: 'text-red-500'
    }
  }[product.stockStatus];

  const StockIcon = stockBadge.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Internal preview banner */}
      {isInternalView && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
          <p className="text-sm text-amber-800">
            Internal preview - this view is not counted in analytics
          </p>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href={`/catalog/${token}`}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Catalog
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Product Image */}
            <div className="aspect-square bg-gray-100 relative">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-24 h-24 text-gray-300" />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="p-6 md:p-8">
              <p className="text-sm text-gray-500 font-mono mb-2">{product.sku}</p>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{product.name}</h1>

              {/* Stock status */}
              <div className="flex items-center gap-2 mb-6">
                <StockIcon className={`w-5 h-5 ${stockBadge.iconClassName}`} />
                <span className={`text-sm font-medium px-2 py-1 rounded-full ${stockBadge.className}`}>
                  {stockBadge.label}
                </span>
                <span className="text-sm text-gray-500">{stockBadge.description}</span>
              </div>

              {/* Price */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">Wholesale Price</p>
                {product.effectivePrice !== null ? (
                  <p className="text-3xl font-bold text-gray-900">
                    ${product.effectivePrice.toFixed(2)}
                    <span className="text-base font-normal text-gray-500"> / unit</span>
                  </p>
                ) : (
                  <p className="text-lg text-gray-500">Contact for pricing</p>
                )}
                {product.wholesalePrice !== null &&
                  product.effectivePrice !== product.wholesalePrice && (
                    <p className="text-sm text-green-600 mt-1">
                      Special pricing for {displayName}
                    </p>
                  )}
              </div>

              {/* Description */}
              {product.description && (
                <div className="mb-6">
                  <h2 className="text-sm font-medium text-gray-700 mb-2">Description</h2>
                  <p className="text-gray-600 whitespace-pre-wrap">{product.description}</p>
                </div>
              )}

              {/* Quick info */}
              <div className="border-t border-gray-200 pt-6">
                <p className="text-sm text-gray-500">
                  Interested in this product? Submit an inquiry below and we'll get back to you.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Inquiry Form */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6 md:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Submit an Inquiry</h2>
          <InquiryForm
            catalogToken={token}
            catalogLinkId={catalogLink.id}
            productId={productId}
            productName={product.name}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} PsillyOps. Catalog prepared for {displayName}.
        </div>
      </footer>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  return {
    title: 'Product Details',
    description: 'View product details and submit an inquiry',
    robots: 'noindex, nofollow'
  };
}
