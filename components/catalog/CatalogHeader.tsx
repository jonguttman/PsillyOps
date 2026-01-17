'use client';

import { ShoppingBag, Download, Phone } from 'lucide-react';

interface CatalogHeaderProps {
  displayName: string;
  onDownloadPdf?: () => void;
  showPdfButton?: boolean;
}

export function CatalogHeader({ displayName, onDownloadPdf, showPdfButton = true }: CatalogHeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Product Catalog</h1>
              <p className="text-sm text-gray-500">Prepared for {displayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showPdfButton && onDownloadPdf && (
              <button
                onClick={onDownloadPdf}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download PDF</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
