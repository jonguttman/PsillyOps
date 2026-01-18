'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CartProvider } from '@/components/catalog/CartContext';
import { CartDrawer } from '@/components/catalog/CartDrawer';
import { Download, Loader2, Eye, EyeOff } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  effectivePrice: number | null;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

interface CatalogClientWrapperProps {
  token: string;
  catalogLinkId: string;
  displayName: string;
  products: Product[];
  isInternalUser?: boolean;
  initialPreviewMode?: boolean;
}

export function CatalogClientWrapper({
  token,
  catalogLinkId,
  displayName,
  products,
  isInternalUser = false,
  initialPreviewMode = false
}: CatalogClientWrapperProps) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [previewAsRetailer, setPreviewAsRetailer] = useState(initialPreviewMode);

  // Effective internal view: internal user AND not previewing as retailer
  const isInternalView = isInternalUser && !previewAsRetailer;

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      // Add internal param to skip tracking for admin/rep views
      const url = isInternalView
        ? `/api/catalog/${token}/pdf?internal=true`
        : `/api/catalog/${token}/pdf`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `catalog-${displayName.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('PDF download error:', error);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleTogglePreview = () => {
    const newPreviewState = !previewAsRetailer;
    setPreviewAsRetailer(newPreviewState);
    // Update URL to persist state on refresh
    const url = new URL(window.location.href);
    if (newPreviewState) {
      url.searchParams.set('preview', 'retailer');
    } else {
      url.searchParams.delete('preview');
    }
    router.replace(url.pathname + url.search, { scroll: false });
  };

  return (
    <CartProvider catalogToken={token}>
      <div className="min-h-screen bg-gray-50">
        {/* Internal user banner with preview toggle */}
        {isInternalUser && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <p className="text-sm text-amber-800">
                {previewAsRetailer
                  ? 'Viewing as retailer - cart buttons visible'
                  : 'Internal preview - cart buttons hidden'}
              </p>
              <button
                onClick={handleTogglePreview}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
              >
                {previewAsRetailer ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Exit Retailer View
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    View as Retailer
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Header with download button */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Product Catalog</h1>
                  <p className="text-sm text-gray-500">Prepared for {displayName}</p>
                </div>
              </div>

              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {downloading ? 'Generating...' : 'Download PDF'}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-8">
          <ProductGrid products={products} catalogToken={token} isInternalView={isInternalView} />
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="text-center text-sm text-gray-500">
              <p>Interested in our products?</p>
              <p className="mt-1">
                Add items to your cart to request a quote or sample.
              </p>
            </div>
            <div className="text-center text-xs text-gray-400 mt-4">
              &copy; {new Date().getFullYear()} PsillyOps. All prices are wholesale.
            </div>
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
