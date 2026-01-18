'use client';

import Link from 'next/link';
import { ArrowLeft, Package, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { CartProvider } from '@/components/catalog/CartContext';
import { CartDrawer } from '@/components/catalog/CartDrawer';
import { AddToCartButton } from '@/components/catalog/AddToCartButton';
import { InquiryForm } from '@/components/catalog/InquiryForm';

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  effectivePrice: number | null;
  wholesalePrice: number | null;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

interface ProductDetailClientProps {
  token: string;
  catalogLinkId: string;
  productId: string;
  product: Product;
  displayName: string;
  isInternalView: boolean;
}

const stockConfig = {
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
};

export function ProductDetailClient({
  token,
  catalogLinkId,
  productId,
  product,
  displayName,
  isInternalView
}: ProductDetailClientProps) {
  const stockBadge = stockConfig[product.stockStatus];
  const StockIcon = stockBadge.icon;

  return (
    <CartProvider catalogToken={token}>
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

                {/* Cart Actions - only for non-internal views */}
                {!isInternalView && (
                  <div className="mb-6">
                    <AddToCartButton
                      product={{
                        id: product.id,
                        name: product.name,
                        sku: product.sku,
                        imageUrl: product.imageUrl
                      }}
                      variant="full"
                    />
                  </div>
                )}

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
                    {isInternalView
                      ? 'Retailers can add this product to their quote or sample request cart.'
                      : 'Add to your quote request or request a sample above, or submit a detailed inquiry below.'}
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
              catalogLinkId={catalogLinkId}
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

        {/* Cart drawer - only show for non-internal views */}
        {!isInternalView && (
          <CartDrawer catalogLinkId={catalogLinkId} token={token} />
        )}
      </div>
    </CartProvider>
  );
}
