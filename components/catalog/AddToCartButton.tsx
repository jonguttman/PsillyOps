'use client';

import { useState } from 'react';
import { ShoppingCart, Beaker, X, Plus, Minus } from 'lucide-react';
import { useCart, SamplePurpose, SAMPLE_PURPOSE_LABELS } from './CartContext';

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
  const [samplePurpose, setSamplePurpose] = useState<SamplePurpose | ''>('');
  const [samplePurposeNotes, setSamplePurposeNotes] = useState('');

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
    if (!samplePurpose) return;
    addSampleRequest({
      id: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl
    }, sampleQuantity, samplePurpose, samplePurpose === 'OTHER' ? samplePurposeNotes.trim() : undefined);
    setShowSampleModal(false);
    setSamplePurpose('');
    setSamplePurposeNotes('');
    setSampleQuantity(1);
  };

  const handleCloseModal = () => {
    setShowSampleModal(false);
    setSamplePurpose('');
    setSamplePurposeNotes('');
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
            purpose={samplePurpose}
            setPurpose={setSamplePurpose}
            purposeNotes={samplePurposeNotes}
            setPurposeNotes={setSamplePurposeNotes}
            onSubmit={handleSubmitSample}
            onClose={handleCloseModal}
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
          purpose={samplePurpose}
          setPurpose={setSamplePurpose}
          purposeNotes={samplePurposeNotes}
          setPurposeNotes={setSamplePurposeNotes}
          onSubmit={handleSubmitSample}
          onClose={handleCloseModal}
        />
      )}
    </>
  );
}

interface SampleModalProps {
  product: { name: string };
  quantity: number;
  setQuantity: (q: number) => void;
  purpose: SamplePurpose | '';
  setPurpose: (p: SamplePurpose | '') => void;
  purposeNotes: string;
  setPurposeNotes: (n: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function SampleModal({ product, quantity, setQuantity, purpose, setPurpose, purposeNotes, setPurposeNotes, onSubmit, onClose }: SampleModalProps) {
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What's this sample for? <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {Object.entries(SAMPLE_PURPOSE_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                    purpose === key
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="samplePurpose"
                    value={key}
                    checked={purpose === key}
                    onChange={() => setPurpose(key as SamplePurpose)}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This helps us prepare the right samples and support your store.
            </p>
          </div>

          {/* Conditional notes field for "Other" */}
          {purpose === 'OTHER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Anything you'd like us to know? (optional)
              </label>
              <textarea
                value={purposeNotes}
                onChange={(e) => setPurposeNotes(e.target.value)}
                placeholder="Let us know any additional details..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
          )}
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
            disabled={!purpose}
            className="flex-1 py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add to Request
          </button>
        </div>
      </div>
    </div>
  );
}
