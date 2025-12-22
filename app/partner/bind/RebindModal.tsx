'use client';

/**
 * RebindModal - Confirmation dialog for rebinding seals
 * 
 * Shows when a seal is already bound to a different product.
 * Requires explicit confirmation before rebinding.
 * Scanner is paused until this modal is resolved.
 */

interface Product {
  id: string;
  name: string;
  sku?: string | null;
}

interface RebindModalProps {
  previousProduct: Product;
  currentProduct: Product;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RebindModal({
  previousProduct,
  currentProduct,
  onConfirm,
  onCancel,
}: RebindModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Rebind Required</h3>
          <p className="text-sm text-gray-600">
            This seal is already bound to a different product.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <div className="bg-red-50 border border-red-100 rounded-lg p-3">
            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Current Binding</p>
            <p className="text-sm font-medium text-red-900">{previousProduct.name}</p>
            {previousProduct.sku && (
              <p className="text-xs text-red-700">SKU: {previousProduct.sku}</p>
            )}
          </div>

          <div className="flex justify-center">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </div>

          <div className="bg-green-50 border border-green-100 rounded-lg p-3">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide">New Binding</p>
            <p className="text-sm font-medium text-green-900">{currentProduct.name}</p>
            {currentProduct.sku && (
              <p className="text-xs text-green-700">SKU: {currentProduct.sku}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
          >
            Confirm Rebind
          </button>
        </div>
      </div>
    </div>
  );
}

