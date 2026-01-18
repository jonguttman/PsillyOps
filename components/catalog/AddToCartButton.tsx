'use client';

import { useState } from 'react';
import { ShoppingCart, Beaker, X, Plus, Minus } from 'lucide-react';
import { useCart } from './CartContext';

interface AddToCartButtonProps {
  product: {
    id: string;
    name: string;
    sku: string;
    imageUrl: string | null;
  };
  variant?: 'inline' | 'full';
}

export function AddToCartButton({ product, variant = 'inline' }: AddToCartButtonProps) {
  const { addToQuote, addSampleRequest } = useCart();
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [sampleQuantity, setSampleQuantity] = useState(1);
  const [sampleReason, setSampleReason] = useState('');

  const handleAddToQuote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToQuote({
      id: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl
    }, quantity);
    setQuantity(1);
  };

  const handleRequestSample = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowSampleModal(true);
  };

  const handleSubmitSample = () => {
    if (!sampleReason.trim()) return;
    addSampleRequest({
      id: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl
    }, sampleQuantity, sampleReason.trim());
    setShowSampleModal(false);
    setSampleReason('');
    setSampleQuantity(1);
  };

  if (variant === 'full') {
    return (
      <div className="space-y-4">
        {/* Quote Request */}
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-gray-300 rounded-lg">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuantity(Math.max(1, quantity - 1)); }}
              className="p-2 hover:bg-gray-100 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-12 text-center font-medium">{quantity}</span>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuantity(quantity + 1); }}
              className="p-2 hover:bg-gray-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleAddToQuote}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            Add to Quote
          </button>
        </div>

        {/* Sample Request */}
        <button
          onClick={handleRequestSample}
          className="w-full flex items-center justify-center gap-2 border border-indigo-600 text-indigo-600 py-2.5 px-4 rounded-lg font-medium hover:bg-indigo-50 transition-colors"
        >
          <Beaker className="w-5 h-5" />
          Request Sample
        </button>

        {/* Sample Modal */}
        {showSampleModal && (
          <SampleModal
            product={product}
            quantity={sampleQuantity}
            setQuantity={setSampleQuantity}
            reason={sampleReason}
            setReason={setSampleReason}
            onSubmit={handleSubmitSample}
            onClose={() => setShowSampleModal(false)}
          />
        )}
      </div>
    );
  }

  // Inline variant for product cards
  return (
    <>
      <div className="flex gap-2 mt-3" onClick={(e) => e.preventDefault()}>
        <button
          onClick={handleAddToQuote}
          className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <ShoppingCart className="w-4 h-4" />
          Quote
        </button>
        <button
          onClick={handleRequestSample}
          className="flex-1 flex items-center justify-center gap-1.5 border border-indigo-600 text-indigo-600 py-2 px-3 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
        >
          <Beaker className="w-4 h-4" />
          Sample
        </button>
      </div>

      {/* Sample Modal */}
      {showSampleModal && (
        <SampleModal
          product={product}
          quantity={sampleQuantity}
          setQuantity={setSampleQuantity}
          reason={sampleReason}
          setReason={setSampleReason}
          onSubmit={handleSubmitSample}
          onClose={() => setShowSampleModal(false)}
        />
      )}
    </>
  );
}

interface SampleModalProps {
  product: { name: string };
  quantity: number;
  setQuantity: (q: number) => void;
  reason: string;
  setReason: (r: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function SampleModal({ product, quantity, setQuantity, reason, setReason, onSubmit, onClose }: SampleModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Beaker className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Request Sample</h3>
            <p className="text-sm text-gray-500">{product.name}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity
            </label>
            <div className="flex items-center border border-gray-300 rounded-lg w-fit">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-2 hover:bg-gray-100 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-12 text-center font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="p-2 hover:bg-gray-100 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Why do you need this sample? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Testing for store display, customer evaluation, quality check..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              This helps us understand your needs and prioritize sample requests.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!reason.trim()}
            className="flex-1 py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add to Request
          </button>
        </div>
      </div>
    </div>
  );
}
